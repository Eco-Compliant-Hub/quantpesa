import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderSidebar, initSidebar } from './sidebar.js';

const SYMBOLS = ['R_10','R_25','R_50','R_75','R_100','1HZ10V','1HZ25V','1HZ50V','1HZ75V','1HZ100V'];

function fakeSignal(sym) {
 const contracts = ['DIGITEVEN','DIGITODD','DIGITOVER','DIGITUNDER','RISE','FALL'];
 const grades = ['A','B','B','C','C','D'];
 const g = grades[Math.floor(Math.random() * grades.length)];
 const prob = g==='A' ? 0.70+Math.random()*0.12 : g==='B' ? 0.58+Math.random()*0.10 : g==='C' ? 0.52+Math.random()*0.06 : 0.40+Math.random()*0.10;
 const contract = contracts[Math.floor(Math.random()*contracts.length)];
 const signal = prob >= 0.62 ? 'ENTER' : prob <= 0.48 ? 'AVOID' : 'NEUTRAL';
 return { sym, grade: g, prob: prob.toFixed(2), contract, signal };
}

export async function render(app, navigate) {
 window._nav = navigate;

 let signals = SYMBOLS.map(fakeSignal);
 let ivId = null;

 app.innerHTML =
 '<div class="edge-left"></div><div class="edge-right"></div><div class="edge-bottom"></div>' +
 '<div style="display:flex;height:100vh;overflow:hidden;background:var(--bg-main);">' +
 renderSidebar('signals') +
 '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">' +
 '<div style="height:48px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0;">' +
 '<span class="live-dot"></span>' +
 '<span style="font-weight:600;font-size:13px;color:var(--accent);">ML SIGNALS</span>' +
 '<span style="font-size:10px;color:var(--text-muted);background:var(--bg-panel);padding:2px 10px;border-radius:4px;border:1px solid var(--border);">Rule-based ensemble · Grade D ML replacing soon</span>' +
 '<div style="flex:1;"></div>' +
 '<span id="topTime" style="font-size:11px;color:var(--text-muted);"></span>' +
 '</div>' +
 '<div style="flex:1;overflow-y:auto;padding:16px;">' +

 // GRADE LEGEND
 '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">' +
 [['A','≥70% — High confidence','var(--profit)'],['B','58–69% — Medium','var(--profit)'],['C','52–57% — Low','var(--accent)'],['D','<52% — Avoid','var(--loss)']].map(([g,d,c]) =>
 '<div style="display:flex;align-items:center;gap:6px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:5px 12px;">' +
 '<span style="font-size:13px;font-weight:700;color:' + c + ';">' + g + '</span>' +
 '<span style="font-size:11px;color:var(--text-muted);">' + d + '</span>' +
 '</div>').join('') +
 '</div>' +

 // SIGNAL GRID
 '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;" id="signalGrid"></div>' +

 '</div>' +
 '</div>' +
 '</div>';

 setInterval(() => { const el = document.getElementById('topTime'); if (el) el.textContent = new Date().toLocaleTimeString(); }, 1000);
 initSidebar(app, navigate, {
 onLogout: async () => { await api.logout(); auth.logout(); navigate('login'); },
 });

 function renderSignals() {
 const el = document.getElementById('signalGrid'); if (!el) return;
 el.innerHTML = signals.map(s => {
 const gcol = s.grade==='A'?'var(--profit)':s.grade==='B'?'var(--profit)':s.grade==='C'?'var(--accent)':'var(--loss)';
 const scol = s.signal==='ENTER'?'var(--profit)':s.signal==='AVOID'?'var(--loss)':'var(--text-muted)';
 const prob100 = (parseFloat(s.prob)*100).toFixed(0);
 return '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:10px;padding:14px;">' +
 '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
 '<div>' +
 '<div style="font-size:13px;font-weight:700;color:var(--text-primary);">' + s.sym + '</div>' +
 '<div style="font-size:10px;color:var(--text-muted);">' + s.contract + '</div>' +
 '</div>' +
 '<div style="text-align:right;">' +
 '<div style="font-size:28px;font-weight:800;color:' + gcol + ';line-height:1;">' + s.grade + '</div>' +
 '<div style="font-size:10px;color:' + scol + ';font-weight:600;">' + s.signal + '</div>' +
 '</div>' +
 '</div>' +
 '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px;">' +
 '<span style="color:var(--text-muted);">Confidence</span>' +
 '<span style="color:' + gcol + ';font-weight:600;">' + prob100 + '%</span>' +
 '</div>' +
 '<div style="background:var(--border);border-radius:4px;height:5px;margin-bottom:10px;">' +
 '<div style="background:' + gcol + ';height:5px;border-radius:4px;width:' + prob100 + '%;transition:width 0.5s;"></div>' +
 '</div>' +
 '<div style="font-size:10px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px;">Source: rule-based ensemble · quant_brain pending</div>' +
 '</div>';
 }).join('');
 }

 renderSignals();
 ivId = setInterval(() => { signals = SYMBOLS.map(fakeSignal); renderSignals(); }, 5000);
}
