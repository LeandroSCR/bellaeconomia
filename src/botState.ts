let enabled = false; // inicia pausado; ative pelo portal

export const isBotEnabled = (): boolean => enabled;
export const setBotEnabled = (value: boolean): void => { enabled = value; };
