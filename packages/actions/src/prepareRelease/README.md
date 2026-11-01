# Preparing releases

Use the [Prepare Release workflow](../../../../.github/workflows/prepare-release.yml) to preview package version and
changelog updates, then apply them to a target branch. Publish the prepared versions with the separate **Release** workflow.

## Usage

Run **Prepare Release** from GitHub Actions. Start with a preview, review the job summary or `release-plan` artifact, then
run again with `dry_run` disabled to apply. Applying creates and pushes a single commit; publishing creates the release tags.

| Input        | Default         | Purpose                                                                                       |
| ------------ | --------------- | --------------------------------------------------------------------------------------------- |
| `branch`     | Workflow branch | Branch to prepare releases on.                                                                |
| `mode`       | `auto`          | Detect packages changed since their last release, or use `manual` to select packages.         |
| `packages`   | Empty           | Manual selection, separated by commas or whitespace. Accepts folder names or published names. |
| `dry_run`    | `true`          | Preview changes without modifying the repository.                                             |
| `request_id` | Empty           | Optional non-secret ID for associating a run with the caller.                                 |

For example, select `manual` mode with `builders,core,discord.js`. Published names such as `@discordjs/builders` work too.

## Setup

Apply mode uses the `DISCORDJS_APP_ID` repository variable and `DISCORDJS_APP_KEY_RELEASE` secret. The release App needs
write access and permission to bypass the applicable protection rules on the target branch.

The action respects the target branch's package release configs. Those configs should generate changelogs and skip
package-level commits and tags (`skipChangelog: false`, `skipTag: true`).

Optional HTTP status callbacks use the `RELEASE_WEBHOOK_URL` and `RELEASE_WEBHOOK_SECRET` repository secrets.
