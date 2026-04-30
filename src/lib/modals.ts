/**
 * Modal delegation: a single document-level click listener that opens
 * or closes modals based on data attributes.
 *
 * Markup contract:
 *   <button data-modal-open="terms-modal">Open</button>
 *   <button data-modal-close="terms-modal">Close</button>
 *
 * The matching modal is `<div id="terms-modal" class="hidden ...">`. Open
 * removes `hidden`; close adds it. Esc closes whatever is currently open.
 *
 * Why delegation: keeps inline `onclick=` out of the markup so we can drop
 * `'unsafe-inline'` from the CSP `script-src`. One handler covers all
 * modals across the app.
 */

function findOpenModalIds(): string[] {
	const open: string[] = [];
	document.querySelectorAll<HTMLElement>('[data-modal-id]').forEach((el) => {
		if (!el.classList.contains('hidden')) {
			const id = el.dataset.modalId ?? el.id;
			if (id) open.push(id);
		}
	});
	return open;
}

function setModalOpen(modalId: string, open: boolean): void {
	const modal = document.getElementById(modalId);
	if (!modal) return;
	modal.classList.toggle('hidden', !open);
	modal.setAttribute('aria-hidden', open ? 'false' : 'true');
}

let installed = false;
export function setupModalDelegation(): void {
	if (installed) return;
	installed = true;

	document.addEventListener('click', (e) => {
		const target = e.target;
		if (!(target instanceof Element)) return;

		const opener = target.closest<HTMLElement>('[data-modal-open]');
		if (opener?.dataset.modalOpen) {
			e.preventDefault();
			setModalOpen(opener.dataset.modalOpen, true);
			return;
		}

		const closer = target.closest<HTMLElement>('[data-modal-close]');
		if (closer?.dataset.modalClose) {
			e.preventDefault();
			setModalOpen(closer.dataset.modalClose, false);
			return;
		}
	});

	document.addEventListener('keydown', (e) => {
		if (e.key !== 'Escape') return;
		findOpenModalIds().forEach((id) => setModalOpen(id, false));
	});
}
