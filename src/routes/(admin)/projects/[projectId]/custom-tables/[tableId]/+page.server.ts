import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { z } from 'zod';

const columnSchema = z.object({
	column_name: z
		.string()
		.min(1, 'Column name is required')
		.regex(/^[a-z][a-z0-9_]*$/, 'Column name must start with a letter and contain only lowercase letters, numbers, and underscores'),
	column_type: z.enum(['text', 'number', 'date', 'boolean'], {
		required_error: 'Column type is required'
	}),
	is_required: z.boolean().optional(),
	default_value: z.string().optional().nullable()
});

export const load: PageServerLoad = async ({ params, locals: { pb } }) => {
	const { projectId, tableId } = params;

	try {
		// Fetch the custom table
		const customTable = await pb.collection('custom_tables').getOne(tableId, {
			filter: `project_id = "${projectId}"`
		});

		if (!customTable) {
			throw error(404, 'Table not found');
		}

		// Fetch columns for this table, sorted by sort_order then created
		const columns = await pb.collection('custom_table_columns').getFullList({
			filter: `table_id = "${tableId}"`,
			sort: 'sort_order,created'
		});

		// Always include the main column as the first column
		const allColumns = [
			{
				id: 'main',
				table_id: tableId,
				column_name: customTable.main_column,
				column_type: 'text',
				is_required: true,
				default_value: null,
				created_at: customTable.created
			},
			...(columns || [])
		];

		// Fetch table data and roles in parallel
		const [tableData, roles] = await Promise.all([
			pb.collection('custom_table_data').getFullList({
				filter: `table_id = "${tableId}"`,
				sort: '-created'
			}),
			pb.collection('roles').getFullList({
				filter: `project_id = "${projectId}"`,
				fields: 'id,name',
				sort: 'name'
			})
		]);

		return {
			customTable,
			columns: allColumns,
			tableData: tableData || [],
			roles: roles || []
		};
	} catch (err) {
		console.error('Error loading table:', err);
		throw error(500, 'Failed to load table');
	}
};

export const actions: Actions = {
	updateTableMeta: async ({ request, params, locals: { pb } }) => {
		const { tableId } = params;
		const formData = await request.formData();
		const field = formData.get('field') as string;
		const value = formData.get('value') as string;

		if (!field) {
			return fail(400, { message: 'Field name is required' });
		}

		const allowedFields = ['display_name', 'description', 'visible_to_roles'];
		if (!allowedFields.includes(field)) {
			return fail(400, { message: 'Invalid field' });
		}

		try {
			let parsedValue: any = value;
			if (field === 'visible_to_roles') {
				parsedValue = value ? JSON.parse(value) : [];
			}
			await pb.collection('custom_tables').update(tableId, {
				[field]: parsedValue
			});
			return { success: true };
		} catch (err) {
			console.error('Error updating table metadata:', err);
			return fail(500, { message: 'Failed to update table' });
		}
	},

	createColumn: async ({ request, params, locals: { pb } }) => {
		const { tableId } = params;
		const formData = await request.formData();

		const columnData = {
			column_name: (formData.get('fieldName') as string)?.trim(),
			column_type: formData.get('fieldType') as string,
			is_required: formData.get('isRequired') === 'true',
			default_value: (formData.get('defaultValue') as string)?.trim() || null
		};

		// Validate with Zod
		const validationResult = columnSchema.safeParse(columnData);
		if (!validationResult.success) {
			return fail(400, {
				message: validationResult.error.errors[0]?.message || 'Invalid column data'
			});
		}

		try {
			// Check if column name already exists for this table
			const existingColumns = await pb.collection('custom_table_columns').getFullList({
				filter: `table_id = "${tableId}"`,
				fields: 'column_name'
			});

			if (existingColumns?.some(col => col.column_name === columnData.column_name)) {
				return fail(400, {
					message: 'A column with that name already exists'
				});
			}

			await pb.collection('custom_table_columns').create({
				table_id: tableId,
				column_name: columnData.column_name,
				column_type: columnData.column_type,
				is_required: columnData.is_required,
				default_value: columnData.default_value
			});

			return { success: true };
		} catch (err) {
			console.error('Error creating column:', err);
			return fail(500, {
				message: 'Failed to create column'
			});
		}
	},

	updateColumn: async ({ request, params, locals: { pb } }) => {
		const { tableId } = params;
		const formData = await request.formData();
		const columnId = formData.get('fieldId') as string;

		const columnData = {
			column_name: (formData.get('fieldName') as string)?.trim(),
			column_type: formData.get('fieldType') as string,
			is_required: formData.get('isRequired') === 'true',
			default_value: (formData.get('defaultValue') as string)?.trim() || null
		};

		try {
			// Get original column name for data migration
			const existingColumn = await pb.collection('custom_table_columns').getOne(columnId);
			const originalName = existingColumn?.column_name;

			// Validate with Zod
			const validationResult = columnSchema.safeParse(columnData);
			if (!validationResult.success) {
				return fail(400, {
					message: validationResult.error.errors[0]?.message || 'Invalid column data'
				});
			}

			// Check if column name already exists (excluding current column)
			const existingColumns = await pb.collection('custom_table_columns').getFullList({
				filter: `table_id = "${tableId}"`
			});

			if (existingColumns?.some(col => col.column_name === columnData.column_name && col.id !== columnId)) {
				return fail(400, {
					message: 'A column with that name already exists'
				});
			}

			// Update column definition
			await pb.collection('custom_table_columns').update(columnId, {
				column_name: columnData.column_name,
				column_type: columnData.column_type,
				is_required: columnData.is_required,
				default_value: columnData.default_value
			});

			// If column name changed, migrate all existing data
			if (originalName && originalName !== columnData.column_name) {
				console.log(`Migrating custom table data from "${originalName}" to "${columnData.column_name}"`);

				// Get all table data
				const tableData = await pb.collection('custom_table_data').getFullList({
					filter: `table_id = "${tableId}"`
				});

				// Update each row that has data under the old column name
				if (tableData) {
					for (const row of tableData) {
						if (row.row_data && row.row_data[originalName] !== undefined) {
							const value = row.row_data[originalName];

							// Create updated row data with new column name
							const updatedRowData = { ...row.row_data };
							updatedRowData[columnData.column_name] = value; // Add new column name
							delete updatedRowData[originalName]; // Remove old column name

							// Update row in database
							await pb.collection('custom_table_data').update(row.id, {
								row_data: updatedRowData
							});
						}
					}
				}
			}

			return { success: true };
		} catch (err) {
			console.error('Error updating column:', err);
			return fail(500, {
				message: 'Failed to update column'
			});
		}
	},

	deleteColumn: async ({ request, params, locals: { pb } }) => {
		const { tableId } = params;
		const formData = await request.formData();
		const columnId = formData.get('fieldId') as string;

		if (!columnId) {
			return fail(400, { message: 'Column ID is required' });
		}

		try {
			// Get column name for data cleanup
			const existingColumn = await pb.collection('custom_table_columns').getOne(columnId);
			const columnName = existingColumn?.column_name;

			// Delete the column
			await pb.collection('custom_table_columns').delete(columnId);

			// Remove column data from all rows
			if (columnName) {
				const tableData = await pb.collection('custom_table_data').getFullList({
					filter: `table_id = "${tableId}"`
				});

				if (tableData) {
					for (const row of tableData) {
						if (row.row_data && row.row_data[columnName] !== undefined) {
							const updatedRowData = { ...row.row_data };
							delete updatedRowData[columnName];

							await pb.collection('custom_table_data').update(row.id, {
								row_data: updatedRowData
							});
						}
					}
				}
			}

			return { success: true };
		} catch (err) {
			console.error('Error deleting column:', err);
			return fail(500, { message: 'Failed to delete column' });
		}
	},

	updateRowData: async ({ request, params, locals: { pb } }) => {
		const { tableId } = params;
		const formData = await request.formData();
		const rowId = formData.get('row_id') as string;
		const columnName = formData.get('column_name') as string;
		const value = formData.get('value') as string;

		if (!rowId || !columnName) {
			return fail(400, { message: 'Row ID and column name are required' });
		}

		try {
			// Get current row data
			const currentRow = await pb.collection('custom_table_data').getOne(rowId, {
				filter: `table_id = "${tableId}"`
			});

			if (!currentRow) {
				return fail(404, { message: 'Row not found' });
			}

			// Update the specific column value
			const updatedRowData = {
				...currentRow.row_data,
				[columnName]: value || null
			};

			// Save updated row data
			await pb.collection('custom_table_data').update(rowId, {
				row_data: updatedRowData
			});

			return { success: true };
		} catch (err) {
			console.error('Error updating row data:', err);
			return fail(500, { message: 'Failed to update row data' });
		}
	},

	updateRow: async ({ request, params, locals: { pb } }) => {
		const { tableId } = params;
		const formData = await request.formData();
		const rowId = formData.get('row_id') as string;
		const rowDataJson = formData.get('row_data') as string;

		if (!rowId || !rowDataJson) {
			return fail(400, { message: 'Row ID and row data are required' });
		}

		let rowData: Record<string, any>;
		try {
			rowData = JSON.parse(rowDataJson);
		} catch (e) {
			return fail(400, { message: 'Invalid row data format' });
		}

		try {
			// Save updated row data
			await pb.collection('custom_table_data').update(rowId, {
				row_data: rowData
			});

			return { success: true };
		} catch (err) {
			console.error('Error updating row:', err);
			return fail(500, { message: 'Failed to update row' });
		}
	},

	deleteRow: async ({ request, params, locals: { pb } }) => {
		const { tableId } = params;
		const formData = await request.formData();
		const rowId = formData.get('row_id') as string;

		if (!rowId) {
			return fail(400, { message: 'Row ID is required' });
		}

		try {
			// Delete the row
			await pb.collection('custom_table_data').delete(rowId);
			return { success: true };
		} catch (err) {
			console.error('Error deleting row:', err);
			return fail(500, { message: 'Failed to delete row' });
		}
	},

	createRow: async ({ request, params, locals: { pb } }) => {
		const { tableId } = params;
		const formData = await request.formData();
		const rowDataJson = formData.get('row_data') as string;

		if (!rowDataJson) {
			return fail(400, { message: 'Row data is required' });
		}

		let rowData: Record<string, any>;
		try {
			rowData = JSON.parse(rowDataJson);
		} catch (e) {
			return fail(400, { message: 'Invalid row data format' });
		}

		try {
			// Create new row
			await pb.collection('custom_table_data').create({
				table_id: tableId,
				row_data: rowData
			});

			return { success: true };
		} catch (err) {
			console.error('Error creating row:', err);
			return fail(500, { message: 'Failed to create row' });
		}
	},

	importCSV: async ({ request, params, locals: { pb } }) => {
		const { tableId } = params;
		const formData = await request.formData();
		const rowsJson = formData.get('rows') as string;
		const replaceData = formData.get('replaceData') === 'true';

		if (!rowsJson) {
			return fail(400, { message: 'No data provided' });
		}

		try {
			const rows: Array<Record<string, string>> = JSON.parse(rowsJson);

			if (rows.length === 0) {
				return fail(400, { message: 'No data rows to import' });
			}

			// Replace existing data if requested
			if (replaceData) {
				const existingRows = await pb.collection('custom_table_data').getFullList({
					filter: `table_id = "${tableId}"`
				});
				for (const row of existingRows) {
					await pb.collection('custom_table_data').delete(row.id);
				}
			}

			// Import new data
			for (const rowData of rows) {
				await pb.collection('custom_table_data').create({
					table_id: tableId,
					row_data: rowData
				});
			}

			return {
				success: true,
				count: rows.length
			};
		} catch (err) {
			console.error('Error importing CSV:', err);
			return fail(500, {
				message: err instanceof Error ? err.message : 'Failed to import CSV'
			});
		}
	}
};
