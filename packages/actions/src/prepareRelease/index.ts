import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { getBooleanInput, getInput, info, setFailed, setOutput, summary } from '@actions/core';
import { createReleaseNotifier, type NotifyRelease } from '../util/releaseNotifications.js';
import { applyReleasePlan, createReleasePlan, type ReleasePlan } from './prepareRelease.js';

interface PrepareNotificationDetails {
	commit?: string;
	plan?: ReleasePlan;
}

let notify: NotifyRelease<PrepareNotificationDetails> = async () => {};

try {
	const dry = getBooleanInput('dry');
	const branch = getInput('branch', { required: true });
	const mode = getInput('mode');
	const repository = process.env.GITHUB_REPOSITORY!;
	const runId = process.env.GITHUB_RUN_ID!;
	notify = createReleaseNotifier<PrepareNotificationDetails>(
		{
			branch,
			dryRun: dry,
			mode,
			repository,
			requestId: getInput('request_id') || null,
			runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT ?? '1'),
			runId,
			runUrl: `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${runId}`,
			workflow: process.env.GITHUB_WORKFLOW!,
		},
		{ url: process.env.RELEASE_WEBHOOK_URL ?? '', secret: process.env.RELEASE_WEBHOOK_SECRET ?? '' },
	);
	await notify('started');
	const plan = await createReleasePlan(process.cwd(), branch, mode, getInput('packages'));
	const planFile = path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'release-plan.json');
	await writeFile(planFile, `${JSON.stringify(plan, null, 2)}\n`);
	setOutput('plan-file', planFile);
	setOutput('plan', plan);
	setOutput(
		'packages',
		plan.packages.filter((pkg) => pkg.nextVersion).map((pkg) => pkg.name),
	);
	info(JSON.stringify(plan, null, 2));
	summary.addHeading(dry ? 'Release preview' : 'Release plan');
	summary.addRaw(`Branch: \`${plan.branch}\`; commit: \`${plan.head}\`\n\n`);
	summary.addTable([
		['Package', 'Last release tag', 'Current version', 'Proposed version'],
		...plan.packages.map((pkg) => [
			pkg.name,
			pkg.previousTag ?? 'No release tag',
			pkg.version,
			pkg.nextVersion ?? 'Unchanged',
		]),
	]);
	await summary.write();
	await notify('planned', { plan });
	let commit = plan.head;
	if (dry) {
		info('Preview complete; no versions, changelogs, commits, tags, or remote refs changed.');
	} else {
		commit = await applyReleasePlan(process.cwd(), plan);
		await summary.addRaw('\nRelease preparation completed.\n').write();
	}

	await notify('completed', { plan, commit });
} catch (error) {
	setFailed(error instanceof Error ? error.message : String(error));
	await notify('failed');
}
