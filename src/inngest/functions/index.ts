import { processItem } from "./process-item";
import { discoverContent } from "./discover";

// Export all Inngest functions for the serve handler
export const functions = [processItem, discoverContent];
