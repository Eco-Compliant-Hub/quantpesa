// Reusable Risk Guard reconfirmation modal.
// Call showRiskConfirmModal(evaluation) with the `evaluation` object
// returned by a 409 needs_confirmation response. Resolves true if the
// user confirms, false if they cancel. Injects its own overlay into
// document.body so it works from any page without markup changes.

const ZONE_LABEL = {
    yellow: { text: 'Caution', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
    orange: { text: 'High exposure', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
    red:    { text: 'Danger', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
};

export function showRiskConfirmModal(evaluation) {
    return new Promise((resolve) => {
        const zone = ZONE_LABEL[evaluation.projected_zone] || ZONE_LABEL.orange;

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[100]';
        overlay.innerHTML = `
            <div class="bg-gray-900 border ${zone.bg} rounded-xl p-6 w-full max-w-md">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-2xl">${evaluation.projected_zone === 'red' ? '\ud83d\udd34' : '\ud83d\udfe0'}</span>
                    <h3 class="font-semibold text-lg ${zone.color}">${zone.text.toUpperCase()} ACCOUNT EXPOSURE</h3>
                </div>
                <div class="space-y-2 text-sm mb-5">
                    <p class="text-gray-400">Current exposure: <span class="text-white font-medium">${evaluation.current_exposure_pct}%</span></p>
                    <p class="text-gray-400">This action adds: <span class="text-white font-medium">${evaluation.proposed_stake}</span></p>
                    <p class="text-gray-300 pt-2 border-t border-gray-800 mt-2">
                        If everything currently open loses, total potential loss becomes
                        <span class="${zone.color} font-semibold"> ${evaluation.projected_total} (${evaluation.projected_exposure_pct}% of your account)</span>.
                    </p>
                </div>
                <p class="text-gray-500 text-xs mb-5">You are choosing to proceed beyond your normal risk range. This is your decision to make -- we just want you to see it clearly first.</p>
                <div class="flex gap-3">
                    <button id="riskConfirmBtn" class="flex-1 px-4 py-2 ${zone.color} border ${zone.bg} hover:brightness-125 text-sm font-medium rounded-lg transition">
                        Confirm & Continue
                    </button>
                    <button id="riskCancelBtn" class="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition">
                        Cancel
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        function cleanup(result) {
            overlay.remove();
            resolve(result);
        }

        overlay.querySelector('#riskConfirmBtn').addEventListener('click', () => cleanup(true));
        overlay.querySelector('#riskCancelBtn').addEventListener('click', () => cleanup(false));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup(false);
        });
    });
}
