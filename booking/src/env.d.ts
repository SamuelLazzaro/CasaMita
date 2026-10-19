// rooms.csv is bundled as a plain string by the "Text" rule in wrangler.jsonc.
declare module '*.csv' {
    const content: string;
    export default content;
}
