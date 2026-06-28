let enabled = true;

export const isBotEnabled = (): boolean => enabled;
export const setBotEnabled = (value: boolean): void => { enabled = value; };
