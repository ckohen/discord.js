export * from './escapers.js';
export * from './formatters.js';

/**
 * The {@link https://github.com/discordjs/discord.js/blob/main/packages/formatters#readme | @ckohen/formatters} version
 * that you are currently using.
 *
 * @privateRemarks This needs to explicitly be `string` so it is not typed as a "const string" that gets injected by esbuild.
 */
export const version = '[VI]{{inject}}[/VI]' as string;
