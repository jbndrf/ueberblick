import { type Page, expect } from '@playwright/test';

export class WorkflowBuilderPage {
	constructor(private page: Page) {}

	// Selectors
	private canvas = '.svelte-flow';
	private stageNode = '.svelte-flow__node';
	private edge = '.svelte-flow__edge';
	private saveButton = 'button:has-text("Save")';
	private workflowNameInput = 'input[placeholder="Workflow name..."]';

	// Drag items from context sidebar
	private startDragItem = '.drag-item-start';
	private stageDragItem = '.drag-item-stage';
	private endDragItem = '.drag-item-end';

	async goto(projectId: string, workflowId: string) {
		await this.page.goto(`/projects/${projectId}/workflows/${workflowId}/builder`);
		await this.page.waitForSelector(this.canvas, { timeout: 15000 });
	}

	async waitForCanvas() {
		await this.page.waitForSelector(this.canvas, { state: 'visible' });
	}

	async setWorkflowName(name: string) {
		await this.page.fill(this.workflowNameInput, name);
	}

	/**
	 * Add a stage to the canvas by dragging from the sidebar
	 */
	async addStage(
		type: 'start' | 'intermediate' | 'end',
		position: { x: number; y: number }
	) {
		const dragSelector =
			type === 'start'
				? this.startDragItem
				: type === 'end'
					? this.endDragItem
					: this.stageDragItem;

		const dragItem = this.page.locator(dragSelector);
		const canvas = this.page.locator(this.canvas);

		// Get canvas bounding box
		const canvasBox = await canvas.boundingBox();
		if (!canvasBox) throw new Error('Canvas not found');

		// Drag to the specified position relative to canvas
		await dragItem.dragTo(canvas, {
			targetPosition: { x: position.x, y: position.y }
		});

		// Wait for the node to appear
		await this.page.waitForTimeout(500);
	}

	/**
	 * Get all stage nodes on the canvas
	 */
	async getStageNodes() {
		return this.page.locator(`${this.stageNode}[data-id]`).all();
	}

	/**
	 * Get stage node count
	 */
	async getStageCount(): Promise<number> {
		const nodes = await this.page.locator(`${this.stageNode}[data-id]:not([data-id^="entry-marker"])`).all();
		return nodes.length;
	}

	/**
	 * Find a stage node by its title text
	 */
	async findStageByName(name: string) {
		return this.page.locator(`${this.stageNode}:has-text("${name}")`).first();
	}

	/**
	 * Click on a stage to select it
	 */
	async selectStage(name: string) {
		const stage = await this.findStageByName(name);
		await stage.click();
		await this.page.waitForTimeout(200);
	}

	/**
	 * Rename a stage using the right sidebar
	 */
	async renameStage(currentName: string, newName: string) {
		await this.selectStage(currentName);

		// Find the name input in the right sidebar
		const nameInput = this.page.locator('input[placeholder*="name"], input[value="' + currentName + '"]').first();
		await nameInput.fill(newName);
		await this.page.waitForTimeout(200);
	}

	/**
	 * Create a connection between two stages using right-click
	 */
	async createConnection(fromStageName: string, toStageName: string) {
		const fromNode = await this.findStageByName(fromStageName);
		const toNode = await this.findStageByName(toStageName);

		// Right-click on source to start connecting
		await fromNode.click({ button: 'right' });
		await this.page.waitForTimeout(300);

		// Right-click on target to complete connection
		await toNode.click({ button: 'right' });
		await this.page.waitForTimeout(500);
	}

	/**
	 * Get all edges/connections on the canvas
	 */
	async getEdges() {
		return this.page.locator(this.edge).all();
	}

	/**
	 * Get edge/connection count
	 */
	async getEdgeCount(): Promise<number> {
		const edges = await this.getEdges();
		return edges.length;
	}

	/**
	 * Click on an edge to select it
	 */
	async selectEdge(index: number = 0) {
		const edges = await this.getEdges();
		if (edges[index]) {
			await edges[index].click();
			await this.page.waitForTimeout(200);
		}
	}

	/**
	 * Add a form tool to the currently selected connection/stage
	 */
	async addFormTool() {
		// In the context sidebar, find the form tool button and click it
		const formButton = this.page.locator('button:has-text("Form"), [data-tool="form"]').first();
		await formButton.click();
		await this.page.waitForTimeout(300);
	}

	/**
	 * Add an edit tool to the currently selected connection/stage
	 */
	async addEditTool() {
		// In the context sidebar, find the edit tool button and click it
		const editButton = this.page.locator('button:has-text("Edit"), [data-tool="edit"]').first();
		await editButton.click();
		await this.page.waitForTimeout(300);
	}

	/**
	 * Add a field to the current form in the form editor
	 */
	async addFormField(
		fieldType: string,
		label: string,
		options?: { required?: boolean; dropdownOptions?: string[] }
	) {
		// Find the field type palette and drag/click the field type
		const fieldPalette = this.page.locator(`[data-field-type="${fieldType}"], button:has-text("${fieldType}")`);
		await fieldPalette.first().click();
		await this.page.waitForTimeout(300);

		// Find the newly added field and set its label
		const labelInput = this.page.locator('input[placeholder*="label"], input[placeholder*="Label"]').last();
		if (await labelInput.isVisible()) {
			await labelInput.fill(label);
		}

		// Set required if specified
		if (options?.required) {
			const requiredCheckbox = this.page.locator('input[type="checkbox"][name*="required"]').last();
			if (await requiredCheckbox.isVisible()) {
				await requiredCheckbox.check();
			}
		}

		// Set dropdown options if specified
		if (options?.dropdownOptions && options.dropdownOptions.length > 0) {
			const optionsInput = this.page.locator('textarea[placeholder*="option"], input[placeholder*="option"]').last();
			if (await optionsInput.isVisible()) {
				await optionsInput.fill(options.dropdownOptions.join('\n'));
			}
		}
	}

	/**
	 * Click save to persist changes
	 */
	async save() {
		await this.page.click(this.saveButton);
		// Wait for save to complete (button should no longer show dirty state)
		await this.page.waitForTimeout(1000);
	}

	/**
	 * Check if the workflow has unsaved changes
	 */
	async hasUnsavedChanges(): Promise<boolean> {
		const saveButton = this.page.locator(this.saveButton);
		const text = await saveButton.textContent();
		return text?.includes('*') || false;
	}

	/**
	 * Wait for save to complete
	 */
	async waitForSaveComplete() {
		// Wait for the save button to no longer show the asterisk
		await this.page.waitForFunction(
			() => {
				const btn = document.querySelector('button:has-text("Save")');
				return btn && !btn.textContent?.includes('*');
			},
			{ timeout: 10000 }
		);
	}
}
