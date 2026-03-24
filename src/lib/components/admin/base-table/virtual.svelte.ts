import {
	Virtualizer,
	elementScroll,
	observeElementOffset,
	observeElementRect,
	type PartialKeys,
	type VirtualizerOptions
} from '@tanstack/virtual-core';

function createVirtualizerBase<
	TScrollElement extends Element | Window,
	TItemElement extends Element
>(
	options: () => VirtualizerOptions<TScrollElement, TItemElement>
): Virtualizer<TScrollElement, TItemElement> {
	const resolvedOptions = options();
	const instance = new Virtualizer(resolvedOptions);

	let virtualItems = $state(instance.getVirtualItems());
	let totalSize = $state(instance.getTotalSize());

	const handler: ProxyHandler<Virtualizer<TScrollElement, TItemElement>> = {
		get(target, prop) {
			if (prop === 'getVirtualItems') return () => virtualItems;
			if (prop === 'getTotalSize') return () => totalSize;
			return Reflect.get(target, prop);
		}
	};

	const virtualizer = new Proxy(instance, handler);

	$effect(() => {
		const cleanup = virtualizer._didMount();
		return cleanup;
	});

	$effect(() => {
		const opts = options();
		virtualizer.setOptions({
			...opts,
			onChange: (instance, sync) => {
				instance._willUpdate();
				virtualItems = instance.getVirtualItems();
				totalSize = instance.getTotalSize();
				opts.onChange?.(instance, sync);
			}
		});
		virtualizer._willUpdate();
		virtualizer.measure();
	});

	return virtualizer;
}

export function createVirtualizer<
	TScrollElement extends Element,
	TItemElement extends Element
>(
	options: () => PartialKeys<
		VirtualizerOptions<TScrollElement, TItemElement>,
		'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
	>
): Virtualizer<TScrollElement, TItemElement> {
	return createVirtualizerBase<TScrollElement, TItemElement>(() => ({
		observeElementRect: observeElementRect,
		observeElementOffset: observeElementOffset,
		scrollToFn: elementScroll,
		...options()
	}));
}
