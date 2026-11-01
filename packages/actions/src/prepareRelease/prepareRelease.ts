import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export type RunCommand = (command: string, args: string[], cwd: string) => Promise<string>;

export const runCommand: RunCommand = async (command, args, cwd) => {
	try {
		const { stdout } = await exec(command, args, {
			cwd,
			maxBuffer: 16 * 1_024 * 1_024,
			env: { ...process.env, FORCE_COLOR: '0', HUSKY: '0', pnpm_config_verify_deps_before_run: 'false' },
		});
		return stdout.trim();
	} catch (error) {
		const failure = error as Error & { stderr?: string; stdout?: string };
		throw new Error(`${failure.message}\n${failure.stdout ?? ''}\n${failure.stderr ?? ''}`);
	}
};

interface ReleaseConfig {
	name: string;
	org?: string;
	packagePath: string;
	tagTemplate?: string;
}

interface ReleasePackage {
	folder: string;
	name: string;
	tagTemplate: string;
	version: string;
}

export interface ReleaseChange extends ReleasePackage {
	changed: boolean;
	nextVersion: string | null;
	previousTag: string | null;
}

export interface ReleasePlan {
	branch: string;
	head: string;
	mode: 'auto' | 'manual';
	packages: ReleaseChange[];
}

async function readPackages(root: string): Promise<ReleasePackage[]> {
	const packages: ReleasePackage[] = [];
	for (const entry of await readdir(path.join(root, 'packages'), { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const folder = `packages/${entry.name}`;
		const manifest = await readFile(path.join(root, folder, 'package.json'), 'utf8').catch(
			(error: NodeJS.ErrnoException) => {
				if (error.code === 'ENOENT') return null;
				throw error;
			},
		);
		if (manifest === null) continue;
		const pkg = JSON.parse(manifest) as {
			name: string;
			private?: boolean;
			scripts?: { release?: string };
			version: string;
		};
		if (pkg.private || pkg.scripts?.release !== 'cliff-jumper') continue;
		const config = JSON.parse(await readFile(path.join(root, folder, '.cliff-jumperrc.json'), 'utf8')) as ReleaseConfig;
		if (config.packagePath !== folder || (config.org ? `@${config.org}/${config.name}` : config.name) !== pkg.name) {
			throw new Error(`Release configuration does not match ${pkg.name}`);
		}

		const tagTemplate = (config.tagTemplate ?? (config.org ? '{{full-name}}@{{new-version}}' : 'v{{new-version}}'))
			.replaceAll('{{full-name}}', pkg.name)
			.replaceAll('{{name}}', config.name)
			.replaceAll('{{org}}', config.org ?? '');
		packages.push({ folder, name: pkg.name, version: pkg.version, tagTemplate });
	}

	return packages.sort((first, second) => first.name.localeCompare(second.name));
}

function stableTagPattern(template: string) {
	return new RegExp(
		`^${template.replaceAll(/[$()*+.?[\\\]^{|}]/g, '\\$&').replace('\\{\\{new-version\\}\\}', '\\d+\\.\\d+\\.\\d+')}$`,
	);
}

/**
 * Uses cliff-jumper's own dry run so preview and apply use the same bump rules.
 */
export function parseNextVersion(output: string, name: string) {
	const prefix = `📦 Bumped ${name}@`;
	const version = output
		.split('\n')
		.find((line) => line.startsWith(prefix))
		?.slice(prefix.length)
		.trim();
	if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error(`Could not read cliff-jumper's proposed version for ${name}:\n${output}`);
	}

	return version;
}

export async function createReleasePlan(
	root: string,
	branch: string,
	mode: string,
	selection: string,
	run = runCommand,
): Promise<ReleasePlan> {
	if (mode !== 'auto' && mode !== 'manual') throw new Error('Mode must be auto or manual');
	await run('git', ['check-ref-format', `refs/heads/${branch}`], root);
	if (await run('git', ['status', '--porcelain', '--untracked-files=no'], root)) {
		throw new Error('Release preparation requires a clean working tree and index');
	}

	if ((await run('git', ['rev-parse', '--is-shallow-repository'], root)) === 'true') {
		throw new Error('Release preparation requires full history and tags (fetch-depth: 0)');
	}

	let packages = await readPackages(root);
	const names = [...new Set(selection.split(/[\s,]+/).filter(Boolean))];
	if (mode === 'auto' && names.length) throw new Error('Package selection must be empty in auto mode');
	if (mode === 'manual') {
		if (!names.length) throw new Error('Select at least one package in manual mode');
		for (const name of names) {
			if (!packages.some((pkg) => pkg.name === name || pkg.folder === `packages/${name}`)) {
				throw new Error(`Unknown or non-releasable package: ${name}`);
			}
		}

		packages = packages.filter(
			(pkg) => names.includes(pkg.name) || names.includes(pkg.folder.slice('packages/'.length)),
		);
	}

	const head = await run('git', ['rev-parse', 'HEAD'], root);
	const tags = (await run('git', ['tag', '--merged', 'HEAD', '--sort=-version:refname'], root)).split('\n');
	const changes: ReleaseChange[] = [];
	for (const pkg of packages) {
		const pattern = stableTagPattern(pkg.tagTemplate);
		const previousTag = tags.find((tag) => pattern.test(tag)) ?? null;
		const diff = previousTag
			? await run('git', ['diff', '--name-only', `${previousTag}..${head}`, '--', `${pkg.folder}/`], root)
			: await run('git', ['ls-files', '--', `${pkg.folder}/`], root);
		const changed = Boolean(diff);
		let nextVersion: string | null = null;
		if (changed || mode === 'manual') {
			const output = await run('pnpm', ['--filter', pkg.name, 'release', '--dry-run'], root);
			nextVersion = parseNextVersion(output, pkg.name);
		}

		changes.push({ ...pkg, previousTag, changed, nextVersion });
	}

	return { branch, head, mode, packages: changes };
}

/**
 * Makes one release commit and pushes it to the target branch. Publishing owns tag creation.
 */
export async function applyReleasePlan(root: string, plan: ReleasePlan, run = runCommand) {
	const releases = plan.packages.filter((pkg) => pkg.nextVersion !== null);
	if (!releases.length) return plan.head;
	if ((await run('git', ['rev-parse', 'HEAD'], root)) !== plan.head) throw new Error('HEAD changed after planning');
	if (await run('git', ['status', '--porcelain', '--untracked-files=no'], root)) {
		throw new Error('Working tree changed after planning');
	}

	// A queued workflow checks out the current branch tip. A later push must still be rejected.
	const remoteHead = await run('git', ['ls-remote', '--exit-code', 'origin', `refs/heads/${plan.branch}`], root);
	if (remoteHead.split(/\s/)[0] !== plan.head)
		throw new Error('Target branch advanced; rerun to generate a fresh plan');
	for (const pkg of releases) {
		await run('pnpm', ['--filter', pkg.name, 'release'], root);
		const manifest = JSON.parse(await readFile(path.join(root, pkg.folder, 'package.json'), 'utf8')) as {
			version: string;
		};
		if (manifest.version !== pkg.nextVersion) throw new Error(`Version for ${pkg.name} differs from the preview`);
	}

	await run('pnpm', ['install', '--lockfile-only', '--ignore-scripts', '--no-frozen-lockfile'], root);
	await run(
		'git',
		[
			'add',
			'--',
			'pnpm-lock.yaml',
			...releases.flatMap((pkg) => [`${pkg.folder}/package.json`, `${pkg.folder}/CHANGELOG.md`]),
		],
		root,
	);
	await run(
		'git',
		[
			'-c',
			'user.name=discordjs-release[bot]',
			'-c',
			'user.email=discordjs-release[bot]@users.noreply.github.com',
			'commit',
			'--no-verify',
			'-m',
			`chore: prepare releases\n\n${releases.map((pkg) => `${pkg.name}@${pkg.nextVersion}`).join('\n')}`,
		],
		root,
	);
	await run('git', ['-c', 'push.followTags=false', 'push', 'origin', `HEAD:refs/heads/${plan.branch}`], root);
	return run('git', ['rev-parse', 'HEAD'], root);
}
