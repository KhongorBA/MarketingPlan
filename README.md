# Маркетинг Зөвлөх

Жижиг бизнест сошиал медиагаар борлуулалт өсгөх сарын төлөвлөгөө гаргадаг вэб апп. 16 энгийн асуултад хариулахад оношилгоо, 7 хоногийн контент, hook, зарын төсөв, 30 хоногийн төлөвлөгөөг гаргана. Текстийг үнэгүй AI бичнэ ([docs/FREE-AI.md](docs/FREE-AI.md)), 3–8-р хэсгийг QPay-ээр төлж нээнэ.

## Ажиллуулах

Node.js 20.12+ хэрэгтэй. Нэмэлт сан суулгах шаардлагагүй.

```bash
cp .env.example .env      # түлхүүрүүдээ бөглөнө
npm start                 # http://localhost:3000
npm test
```

AI түлхүүргүй үед ч ажиллана, текстийг загвараар гаргана.

## Бүтэц

```
public/            frontend (index.html, styles.css, app.js)
server/index.js    HTTP сервер, API
server/engine/     дүрэмд суурилсан төлөвлөгөө: тоо, төсөв, бүтэц (kb.js = мэдлэгийн сан)
server/ai/         үнэгүй AI үйлчилгээнүүд ба текст бичүүлэх prompt
server/qpay.js     QPay v2 клиент
server/store.js    төлөвлөгөө бүрийг data/plans/<key>.json-д хадгална
public/admin.html  статистик (ADMIN_TOKEN-оор нэвтэрнэ)
```

## API

| Арга | Зам | Тайлбар |
|---|---|---|
| POST | `/api/plan` | `{answers}` → төлөвлөгөө. Төлөөгүй бол 7 хоногоос зөвхөн Даваа гараг ирж, 4–8-р хэсэг ирэхгүй. |
| GET | `/api/plan/:key` | Хадгалсан төлөвлөгөө |
| POST | `/api/plan/:key/regenerate` | Ижил мэдээллээр шинэ хувилбар |
| POST | `/api/qpay/invoice` | `{key}` → QR, банкны апп-ын холбоос |
| POST | `/api/qpay/check` | `{key}` → `{paid}` |
| GET/POST | `/api/qpay/callback?key=` | QPay-ийн callback; төлбөрийг QPay-ээс дахин шалгана |
| GET | `/api/health` | Идэвхтэй AI, QPay-ийн төлөв |
| GET | `/api/admin/stats` | `Authorization: Bearer <ADMIN_TOKEN>` → төлөвлөгөө, орлого, AI-ийн статистик |

## Production-д гаргахын өмнө

- `.env`-д `QPAY_TEST_MODE=false`, QPay-ийн мэдээлэл, `PUBLIC_URL`-ийг жинхэнэ HTTPS хаягаар тохируул.
- Reverse proxy (nginx, Cloudflare) ард ажиллуулбал `TRUST_PROXY=true`.
- `ADMIN_TOKEN`-д урт санамсаргүй утга өг.
- `data/` хавтсыг нөөцөл (`DATA_DIR`-ээр өөр газар зааж болно). Олон сервер дээр ажиллуулах бол Postgres руу шилжүүл.

## Үнэгүй хэрэглэгч юу харах вэ

Оношилгоо, платформ, 7 хоногийн контентын **Даваа гараг** бүтнээрээ үнэгүй. Үлдсэн 6 өдөр, hook сан, төсөв, 30 хоногийн төлөвлөгөө, хэмжилт нь төлбөрийн дараа серверээс ирнэ. Төлсний дараа PDF, Markdown, календарь (.ics) татах боломжтой.
