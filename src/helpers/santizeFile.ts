export const sanitizeFileName = (fileName: string): string => {
  return fileName
    .toLowerCase() // Convert to lowercase
    .replace(/[^a-z0-9.]+/g, "_") // Replace any non-alphanumeric chars (except dots) with underscore
    .replace(/_{2,}/g, "_") // Replace multiple consecutive underscores with single underscore
    .replace(/^_+|_+$/g, ""); // Remove leading/trailing underscores
};
