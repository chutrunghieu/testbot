export const formatDate = (date: number): string => {
  return new Date(date + 7 * 60 * 60 * 1000)
    .toISOString()
    .replace(/T/, ' ')
    .replace(/\..+/, '');
};
