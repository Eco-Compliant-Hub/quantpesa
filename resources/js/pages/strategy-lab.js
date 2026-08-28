import { api } from '../api.js';
import { auth } from '../auth.js';
import { renderSidebar, initSidebar } from './sidebar.js';

export async function render(app, navigate) {
 window._nav = navigate;

 app.innerHTML =
 '<div class="edge-left"></div><div class="edge-right"></div><div class="edge-bottom"></div>' +
 '<div style="display:flex;height:100vh;overflow:hidden;background:var(--bg-main);">' + renderSidebar('strategy-lab') +
 '<div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">' +
 '<div style="height:48px;background:var(--bg-secondary);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0;">' +
 '<span style="font-weight:600;font-size:13px;color:var(--accent);">STRATEGY LAB</span>' +
 '<span style="font-size:10px;color:var(--text-muted);background:var(--bg-panel);padding:2px 10px;border-radius:4px;border:1px solid var(--border);">Backtest against historical ticks — requires quant_brain data</span>' +
 '<div style="flex:1;"></div><span id="topTime" style="font-size:11px;color:var(--text-muted);"></span>' +
 '</div>' +
 '<div style="flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:320px 1fr;gap:12px;">' +

 // CONFIG
 '<div class="panel" style="align-self:start;">' +
 '<div class="panel-title">STRATEGY CONFIG</div>' +
 '<div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">' +
 '<div><label style="font-size:10px;color:var(--text-muted);">CONTRACT TYPE</label><select id="slContract" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px;color:var(--text-primary);font-size:12px;"><option>DIGITEVEN</option><option>DIGITODD</option><option>DIGITOVER</option><option>DIGITUNDER</option><option>RISE</option></select></div>' +
 '<div><label style="font-size:10px;color:var(--text-muted);">SYMBOL</label><select id="slSym" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px;color:var(--text-primary);font-size:12px;"><option>R_25</option><option>R_50</option><option>R_75</option><option>R_100</option></select></div>' +
 '<div><label style="font-size:10px;color:var(--text-muted);">ENTRY CONDITION</label><select id="slEntry" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px;color:var(--text-primary);font-size:12px;"><option>Even run ≥ 3</option><option>Odd run ≥ 3</option><option>Digit absence ≥ 10</option><option>Every tick</option><option>Confidence ≥ 60%</option></select></div>' +
 '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
 '<div><label style="font-size:10px;color:var(--text-muted);">STAKE ($)</label><input id="slStake" type="number" value="1" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px;color:var(--text-primary);font-size:12px;"></div>' +
 '<div><label style="font-size:10px;color:var(--text-muted);">TICKS</label><input id="slTicks" type="number" value="500" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px;color:var(--text-primary);font-size:12px;"></div>' +
 '</div>' +
 '<div><label style="font-size:10px;color:var(--text-muted);">MARTINGALE</label><select id="slMG" style="width:100%;margin-top:4px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:7px;color:var(--text-primary);font-size:12px;"><option>Off</option><option>2×</option><option>3×</option></select></div>' +
 '<button onclick="runBacktest()" class="btn btn-profit" style="padding:10px;font-weight:600;">▶ Run Backtest</button>' +
 '<div id="btProgress" style="display:none;"><div style="background:var(--border);border-radius:4px;height:6px;"><div id="btBar" style="background:var(--profit);height:6px;border-radius:4px;width:0%;transition:width 0.1s;"></div></div><div style="font-size:10px;color:var(--text-muted);margin-top:4px;" id="btMsg">Running...</div></div>' +
 '</div>' +
 '</div>' +

 // RESULTS
 '<div>' +
 '<div id="btResults" style="display:none;">' +
 '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px;" id="btMetrics"></div>' +
 '<div class="panel" style="margin-bottom:12px;"><div class="panel-title">EQUITY CURVE</div><div id="btChart" style="height:120px;display:flex;align-items:flex-end;gap:1px;margin-top:10px;"></div></div>' +
 '<div class="panel"><div class="panel-title">TRADE LOG (last 20)</div><div id="btLog" style="margin-top:8px;max-height:260px;overflow-y:auto;"></div></div>' +
 '</div>' +
 '<div id="btEmpty" class="panel" style="text-align:center;padding:40px;">' +
 '<div style="font-size:32px;margin-bottom:12px;"></div>' +
 '<div style="font-size:14px;color:var(--text-primary);font-weight:600;margin-bottom:8px;">Configure and run a backtest</div>' +
 '<div style="font-size:12px;color:var(--text-muted);">Results simulate against 500 ticks of synthetic data.<br>Live backtesting against quant_brain historical ticks<br>will be available once System 2 is collecting.</div>' +
 '</div>' +
 '</div>' +

 '</div></div></div>';

 setInterval(() => { const el=document.getElementById('topTime'); if(el) el.textContent=new Date().toLocaleTimeString(); },1000);
 initSidebar(app, navigate, {
 onLogout: async () => { await api.logout(); auth.logout(); navigate('login'); },
 });

 window.runBacktest = function() {
 const ticks = parseInt(document.getElementById('slTicks').value) || 500;
 const stake = parseFloat(document.getElementById('slStake').value) || 1;
 const prog = document.getElementById('btProgress');
 const bar = document.getElementById('btBar');
 const msg = document.getElementById('btMsg');
 prog.style.display = 'block';

 // Simulate with animation
 let pct = 0;
 const iv = setInterval(() => {
 pct += 4;
 bar.style.width = Math.min(pct, 100) + '%';
 msg.textContent = 'Processing ' + Math.min(Math.floor(pct/100*ticks), ticks) + ' / ' + ticks + ' ticks...';
 if (pct >= 100) {
 clearInterval(iv);
 prog.style.display = 'none';
 showResults(ticks, stake);
 }
 }, 40);
 };

 function showResults(ticks, stake) {
 // Simulate backtest
 let equity = 0; const curve = [0]; let wins=0, maxDD=0, peak=0;
 const log = [];
 for (let i = 0; i < ticks; i++) {
 const win = Math.random() > 0.42;
 const pnl = win ? +(stake*0.95).toFixed(2) : -stake;
 equity = +(equity + pnl).toFixed(2);
 curve.push(equity);
 if (win) wins++;
 if (equity > peak) peak = equity;
 if (peak - equity > maxDD) maxDD = +(peak - equity).toFixed(2);
 if (log.length < 20) log.push({ i: i+1, win, pnl, equity });
 }
 const wr = (wins/ticks*100).toFixed(1);
 const col = equity >= 0 ? 'var(--profit)' : 'var(--loss)';

 document.getElementById('btEmpty').style.display = 'none';
 document.getElementById('btResults').style.display = 'block';

 document.getElementById('btMetrics').innerHTML = [
 { label:'Net P&L', val:(equity>=0?'+':'')+'$'+equity.toFixed(2), col },
 { label:'Win Rate', val:wr+'%', col:'var(--profit)' },
 { label:'Total Trades', val:ticks, col:'var(--text-primary)' },
 { label:'Max Drawdown', val:'$'+maxDD, col:'var(--loss)' },
 ].map(m => '<div class="panel" style="text-align:center;padding:12px;"><div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">'+m.label+'</div><div style="font-size:20px;font-weight:700;color:'+m.col+';">'+m.val+'</div></div>').join('');

 // Equity curve bars
 const minE = Math.min(...curve), maxE = Math.max(...curve), range = maxE-minE||1;
 document.getElementById('btChart').innerHTML = curve.map(v => {
 const h = Math.max(2, ((v-minE)/range)*110);
 return '<div style="flex:1;height:'+h+'px;background:'+(v>=0?'var(--profit)':'var(--loss)')+';opacity:0.7;border-radius:1px;transition:height 0.2s;"></div>';
 }).join('');

 document.getElementById('btLog').innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px;">' +
 '<thead><tr style="border-bottom:1px solid var(--border);">' +
 ['#','Result','P&L','Equity'].map(h=>'<th style="text-align:left;padding:5px 8px;font-size:10px;color:var(--text-muted);">'+h+'</th>').join('') +
 '</tr></thead><tbody>' +
 log.map(t => '<tr style="border-bottom:1px solid var(--border);">' +
 '<td style="padding:5px 8px;color:var(--text-muted);">'+t.i+'</td>' +
 '<td style="padding:5px 8px;"><span style="background:'+(t.win?'var(--profit)':'var(--loss)')+'20;color:'+(t.win?'var(--profit)':'var(--loss)')+';padding:2px 8px;border-radius:3px;font-size:10px;">'+(t.win?'WIN':'LOSS')+'</span></td>' +
 '<td style="padding:5px 8px;color:'+(t.win?'var(--profit)':'var(--loss)')+';font-weight:600;">'+(t.pnl>=0?'+':'')+'$'+t.pnl+'</td>' +
 '<td style="padding:5px 8px;color:'+(t.equity>=0?'var(--profit)':'var(--loss)')+';font-weight:600;">'+(t.equity>=0?'+':'')+'$'+t.equity.toFixed(2)+'</td>' +
 '</tr>').join('') +
 '</tbody></table>';
 }
}
