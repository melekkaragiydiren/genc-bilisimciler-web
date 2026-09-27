import './styles/poster.css';
import { qrSvg } from './qr';

const raw = new URLSearchParams(location.search).get('u') ?? '';
let url: URL | null = null;
try {
  url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') url = null;
} catch {
  url = null;
}

const sheet = document.getElementById('sheet')!;
const printBtn = document.getElementById('print') as HTMLButtonElement;

if (!url) {
  sheet.hidden = true;
  printBtn.disabled = true;
  document.getElementById('error')!.hidden = false;
} else {
  document.getElementById('host')!.textContent = url.host;
  qrSvg(url.toString()).then((svg) => (document.getElementById('qr')!.innerHTML = svg));
}

printBtn.addEventListener('click', async () => {
  // Yazı tipleri ve görsel yüklenmeden yazdırılırsa afiş eksik çıkar
  await document.fonts.ready;
  window.print();
});
