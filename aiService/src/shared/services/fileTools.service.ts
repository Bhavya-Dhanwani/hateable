// Importing modules
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import logger from "../config/logger.config.js";

// creates a list of langchain tools pointing to the project's file server url
export function createFileTools(baseUrl: string) {

	// tool to retrieve file tree
	const getFileTreeTool = tool(
		async () => {

			const url = `${baseUrl}/file-tree`;
			logger.info(`Tool get_file_tree: Requesting ${url}`);

			try {

				const response = await fetch(url);

				if (!response.ok) {
					const errText = await response.text();
					return `Error reading file tree: ${response.statusText} (${errText})`;
				}

				const data = (await response.json()) as { success: boolean; tree: string; message?: string };

				return data.tree || "Workspace is empty.";

			} catch (error) {

				const err = error as Error;
				logger.error(err, "Tool get_file_tree failed");

				return `Error connecting to file server: ${err.message}`;

			}

		},
		{
			name: "get_file_tree",
			description: "Retrieves the tree structure of all files in the workspace (excluding build, git, and node_modules). Use this to see what files exist in the project.",
			schema: z.object({}),
		}
	);

	// tool to read files
	const readFilesTool = tool(
		async ({ filenames }) => {

			const url = `${baseUrl}/files?filenames=${encodeURIComponent(filenames.join(","))}`;
			logger.info(`Tool read_files: Requesting ${url}`);

			try {

				const response = await fetch(url);

				if (!response.ok) {
					const errText = await response.text();
					return `Error reading files: ${response.statusText} (${errText})`;
				}

				const data = (await response.json()) as { success: boolean; files: Record<string, string> };

				if (!data.files || Object.keys(data.files).length === 0) {
					return "No files were found or read.";
				}

				let output = "";

				for (const [filename, content] of Object.entries(data.files)) {
					output += `=== File: ${filename} ===\n${content}\n\n`;
				}

				return output;

			} catch (error) {

				const err = error as Error;
				logger.error(err, "Tool read_files failed");

				return `Error connecting to file server: ${err.message}`;

			}

		},
		{
			name: "read_files",
			description: "Reads the contents of one or more files in the workspace. Give a list of filenames to retrieve their actual code or text contents.",
			schema: z.object({
				filenames: z.array(z.string()).describe("The list of paths/filenames to read (e.g. ['src/app.ts', 'package.json'])"),
			}),
		}
	);

	// tool to create files
	const createFilesTool = tool(
		async ({ files }) => {

			const url = `${baseUrl}/files`;
			logger.info(`Tool create_files: Sending POST to ${url}`);

			try {

				const response = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(files),
				});

				if (!response.ok) {
					const errText = await response.text();
					return `Error creating files: ${response.statusText} (${errText})`;
				}

				const data = (await response.json()) as { success: boolean; message: string };

				return data.message || "Files created successfully.";

			} catch (error) {

				const err = error as Error;
				logger.error(err, "Tool create_files failed");

				return `Error connecting to file server: ${err.message}`;

			}

		},
		{
			name: "create_files",
			description: "Creates new files in the workspace. The argument should be an object mapping filenames/paths to their respective text contents.",
			schema: z.object({
				files: z.record(z.string(), z.string()).describe("A JSON object of filename -> content mapping (e.g. {'src/utils.ts': 'export const add = (a, b) => a + b;'})"),
			}),
		}
	);

	// tool to update files
	const updateFilesTool = tool(
		async ({ files }) => {

			const url = `${baseUrl}/files`;
			logger.info(`Tool update_files: Sending PATCH to ${url}`);

			try {

				const response = await fetch(url, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(files),
				});

				if (!response.ok) {
					const errText = await response.text();
					return `Error updating files: ${response.statusText} (${errText})`;
				}

				const data = (await response.json()) as { success: boolean; message: string };

				return data.message || "Files updated successfully.";

			} catch (error) {

				const err = error as Error;
				logger.error(err, "Tool update_files failed");

				return `Error connecting to file server: ${err.message}`;

			}

		},
		{
			name: "update_files",
			description: "Updates/overwrites existing files in the workspace. The argument should be an object mapping filenames/paths to their new text contents.",
			schema: z.object({
				files: z.record(z.string(), z.string()).describe("A JSON object of filename -> new content mapping (e.g. {'src/utils.ts': 'export const add = (a, b) => a + b;'})"),
			}),
		}
	);

	// tool to delete files
	const deleteFilesTool = tool(
		async ({ filenames }) => {

			const url = `${baseUrl}/files?filenames=${encodeURIComponent(filenames.join(","))}`;
			logger.info(`Tool delete_files: Sending DELETE to ${url}`);

			try {

				const response = await fetch(url, {
					method: "DELETE",
				});

				if (!response.ok) {
					const errText = await response.text();
					return `Error deleting files: ${response.statusText} (${errText})`;
				}

				const data = (await response.json()) as { success: boolean; message: string };

				return data.message || "Files deleted successfully.";

			} catch (error) {

				const err = error as Error;
				logger.error(err, "Tool delete_files failed");

				return `Error connecting to file server: ${err.message}`;

			}

		},
		{
			name: "delete_files",
			description: "Deletes one or more files in the workspace.",
			schema: z.object({
				filenames: z.array(z.string()).describe("The list of paths/filenames to delete from the workspace."),
			}),
		}
	);

	return [
		getFileTreeTool,
		readFilesTool,
		createFilesTool,
		updateFilesTool,
		deleteFilesTool
	];

}
