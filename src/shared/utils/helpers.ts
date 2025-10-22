export const formatDate = (date: number): string => {
  return new Date(date).toISOString().replace(/T/, ' ').replace(/\..+/, '');
};
