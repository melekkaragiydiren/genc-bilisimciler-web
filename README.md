# Genç Bilişimciler Topluluğu — Tanıtım Sitesi

Stantta QR kod okutularak açılan, telefon öncelikli, kaydırmalı tanıtım sitesi.
Kaydırdıkça altın devre yollu küp biçim değiştirir:

| # | Bölüm | Küp |
|---|-------|-----|
| 1 | Hoş geldiniz | Bütün küp, yavaşça döner |
| 2 | Şu anda standımızdasınız | Katmanlar Rubik gibi dönüp aralanır |
| 3 | Biz kimiz? | Kamera küpün içine dalar, parçalar saçılır, çekirdek görünür |
| 4 | Misyon & vizyon | Parçalar ışıklı bir ağa dönüşür |
| 5 | Öneri formu | Merkezli topluluk grafiği; öneri gönderilince çekirdek parlar |
| 6 | Üye ol | Her şey yeniden küpte birleşir |

Hareket eden her parça arkasında sönümlenen altın bir iz bırakır. Küp dokuları tarayıcıda
çizilir (görsel dosyası indirilmez); 3D sahne ayrı parça olarak yüklenir, metin anında görünür.
WebGL yoksa konsept görseli arka plan olarak gösterilir.

## Çalıştırma

Gerekli: Node.js 22.18+ (önerilen 24).

```bash
npm install
cp .env.example .env     # ADMIN_PASSWORD'ü değiştirin
npm run dev              # http://localhost:5173  (API: 3001)
```

Aynı Wi-Fi'daki telefondan denemek için Vite'ın yazdığı `Network:` adresini açın.

Production:

```bash
npm run build
npm start                # http://localhost:3001 (site + API tek sunucuda)
```

## Admin paneli

`/admin/` adresi. `.env` içindeki `ADMIN_PASSWORD` ile girilir (en az 12 karakter).

- Gelen önerileri listeleme, arama, silme, CSV indirme (Excel uyumlu)
- En çok istenen konuların dağılımı
- **Üyelik bağlantısı:** son sayfadaki "Üye Ol" butonunun adresi buradan girilir,
  yeniden yayına gerek yoktur. Boşken buton "çok yakında" gösterir.

Öneriler `data/gbt.sqlite` dosyasında tutulur (Node'un yerleşik `node:sqlite` modülü; ek veritabanı kurulumu yok).
Bu dosyayı yedekleyin.

## Yayına alma (domain gelince)

Tek bir Node süreci hem siteyi hem API'yi sunar; kalıcı bir disk gerekir (SQLite dosyası için).

**Docker ile (VPS, Render, Railway, Fly.io…):**

```bash
docker build -t gbt-web .
docker run -d -p 3001:3001 -v gbt-data:/data \
  -e ADMIN_PASSWORD='...' -e SESSION_SECRET='...' -e TRUST_PROXY=1 gbt-web
```

Önüne HTTPS sağlayan bir reverse proxy (Caddy / nginx) koyup domaini ona yönlendirin.
Caddy örneği:

```
gbt.ornek.edu.tr {
    reverse_proxy localhost:3001
}
```

Proxy arkasında `TRUST_PROXY=1` olmalı (rate limit gerçek IP'yi görsün, çerezler `Secure` olsun).

## Güvenlik notları

- Admin oturumu HMAC imzalı, `HttpOnly` + `SameSite=Strict` çerez; 12 saat geçerli.
- Giriş denemeleri IP başına 15 dakikada 10 ile sınırlı; öneri gönderimi 10 dakikada 40
  (stantta herkes aynı kampüs Wi-Fi'ından gelebildiği için cömert tutuldu).
- Bot tuzağı (gizli alan), uzunluk sınırları, konu listesi sunucuda doğrulanır.
- CSP ve güvenlik başlıkları; CSV'de Excel formül enjeksiyonu engellenir.

## Metinleri düzenleme

- Sayfa metinleri: `index.html`
- Formdaki hızlı seçim konuları: `src/shared/topics.ts` (sunucu da bu listeyle doğrular)
- Küpün bölüm bölüm konumu/davranışı: `src/scene/cube-scene.ts` içindeki `STAGES`
- Renkler ve yazı tipleri: `src/styles/tokens.css`

## Klasör yapısı

```
index.html            ana site (6 bölüm)
admin/index.html      admin paneli
src/main.ts           kaydırma, form, üyelik bağlantısı
src/admin.ts          admin paneli mantığı
src/scene/            3D küp sahnesi + prosedürel devre dokusu
src/shared/topics.ts  site ve sunucunun ortak konu listesi
server/               Express API, SQLite, oturum, rate limit
docs/reference/       konsept görseller
```
