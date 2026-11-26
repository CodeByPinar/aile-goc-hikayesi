# Aile Göç Hikâyesi

**Soy ağacınızı verin; Claude atalarınızın yaşadığı her yeri kendi döneminde araştırsın, kaynaklı bir rapor yazsın ve ailenizin göçünü Türkçe seslendirmeli bir harita videosuyla anlatsın.**

`family-migration-story`, [Claude Code](https://code.claude.com) için bir skill ve plugin'dir. Girdi olarak e-Devlet "Alt-Üst Soy Bilgisi" PDF'ini, MyHeritage / Ancestry / FamilySearch'ten alınmış bir GEDCOM dosyasını ya da elle yazılmış bir listeyi kabul eder.

![Örnek videodan: Selanik'ten İzmir'e mübadele yolu](docs/ornek-rota.gif)

<sub>Yukarıdaki görüntüler aşağıdaki uydurma "Örnek ailesi"nden alındı. Kişiler kurgusaldır; yerler, tarihler ve kaynaklar gerçektir.</sub>

## Ne üretir?

1. **Araştırma dosyası** (`research/dossier.json`): Ailenin yaşadığı her yer, ailenin orada bulunduğu yıllar için araştırılır. Kaynaklar arasında Osmanlı arşiv kataloğu, salnameler, nüfus sayımları, Wikidata, akademik makaleler (OpenAlex, Crossref, DergiPark) ve dijitalleştirilmiş kitaplar (Internet Archive, HathiTrust) var. Her bulgu kaynağıyla ve bir güven derecesiyle yazılır.
2. **HTML rapor** (`report.html`), şunları içerir:
   - köken dağılımı
   - kuşak kuşak kişiler
   - her yerin o zamanı ve bugünü
   - aile olaylarıyla dünya olaylarını birleştiren zaman çizelgesi
   - açık sorular
   - kaynakça
3. **Harita videosu** (`video/out/*.mp4`), [Remotion](https://www.remotion.dev) ile hazırlanır:
   - Anne ve baba tarafları ayrı ayrı değil, tek bir zaman çizgisinde iç içe anlatılır.
   - Göç yolları haritada çizilir ve dönem fotoğrafları gösterilir.
   - Savaşlar, antlaşmalar, mübadele ve Soyadı Kanunu gibi dünya ve Türkiye olayları hikâyeye katılır.
   - Seslendirme bilgisayarınızda yapılır; Türkçe için [yazgi-tts](https://huggingface.co/erkamk/yazgi-tts-1) kullanılır.

## Önerilen model: Claude Opus 5.5, effort `xhigh`

Bu skill uzun ve çok adımlı bir iş yapar: onlarca kaynak okur, yüzlerce araç çağrısı yapar, bulguları derecelendirir, sonra hikâyeyi ve videoyu kurup kontrol eder. En iyi sonucu **Claude Opus 5.5** ve **xhigh** effort ile verir. Daha küçük bir model ya da daha düşük effort daha az kaynak okur ve daha yüzeysel bir araştırma çıkarır.

Claude Code'u bu ayarlarla başlatın:

```bash
claude --model claude-opus-5-5 --effort xhigh
```

Açık bir oturumda aynı ayarı `/model claude-opus-5-5` ve ardından `/effort xhigh` ile yapabilirsiniz. Opus 5.5 güncel bir Claude Code ister; gerekirse önce `claude update` çalıştırın.

Skill'in kendi ayarlarında da `model: claude-opus-5-5` ve `effort: xhigh` var. Bu yüzden `/family-migration-story` diye çağırdığınızda Claude Code o tur için bu modeli ve effort'u kullanır. Hesabınızda bu model açık değilse oturumunuzdaki modelle devam eder; o durumda elinizdeki en güçlü modeli ve en yüksek effort'u seçin.

## Kurulum

Terminalde iki komut:

```bash
claude plugin marketplace add f/family-migration-story
```

```bash
claude plugin install family-migration-story@family-migration-story
```

Ya da açık bir Claude Code oturumunda:

```text
/plugin marketplace add f/family-migration-story
/plugin install family-migration-story@family-migration-story
```

Kurulumdan sonra Claude Code'u yeniden başlatın ya da oturumda `/reload-plugins` yazın.

Güncellemek ve kaldırmak için:

```bash
claude plugin update family-migration-story@family-migration-story
```

```bash
claude plugin uninstall family-migration-story@family-migration-story
```

Plugin sistemi yerine yalnızca skill klasörünü kullanmak isterseniz:

```bash
git clone https://github.com/f/family-migration-story.git && cp -R family-migration-story/skills/family-migration-story ~/.claude/skills/
```

### Gereksinimler

| Ne için | Gereken |
|---|---|
| Her şey | Güncel Claude Code, web araması açık |
| e-Devlet PDF'i okumak | [uv](https://docs.astral.sh/uv/) (pypdf'i geçici olarak kurar) |
| Araştırma ve rapor | Python 3.10+ (yalnızca standart kütüphane) |
| Video | Node.js 20+, ffmpeg/ffprobe, uv ve yaklaşık 5 GB boş disk |

Video için gereken modeller ilk kullanımda bir kez indirilir:
- yazgi-tts modeli (~1,2 GB)
- doğrulama için faster-whisper (~0,5 GB)
- Remotion'ın kullandığı tarayıcı

Skill macOS'ta geliştirildi ve denendi. Türkçe dışındaki dillerde macOS'un kendi sesleri (`say`) kullanılır.

## Kullanım

Soy ağacınızı Claude Code'a verin ve ne istediğinizi yazın:

- "Ekteki e-Devlet soy ağacımı araştır; kaynaklı bir rapor ve Türkçe seslendirmeli bir harita videosu hazırla."
- "MyHeritage'tan aldığım `family.ged` dosyasındaki ailemin nereden geldiğini araştır, kaynaklı rapor yaz. Video şimdilik gerekmiyor."
- "Anneannemin ailesi 1924'te Kavala'dan gelmiş, babamın tarafı Rize'den. Elimde bu isimler ve doğum yılları var, bir göç videosu yapalım."

Skill'i doğrudan çağırmak için `/family-migration-story` yazabilirsiniz.

**e-Devlet PDF'i nasıl alınır?**
1. turkiye.gov.tr'de "Alt-Üst Soy Bilgisi Sorgulama" hizmetini açın.
2. Belgeyi oluşturup PDF olarak indirin.
3. PDF'i sohbete sürükleyin.

### Aşamalar

Her aşama bir sonraki aşamanın okuduğu dosyaları bırakır. İş herhangi bir aşamada durup sonra kaldığı yerden devam edebilir.

| Aşama | Ne olur | Çıktı |
|---|---|---|
| 0. Kayıt | Soy ağacı tek bir biçime çevrilir ve doğrulanır. Ailede anlatılan hikâyeler (bir vapur, bir sandık, neden göçüldüğü) sorulur. | `familytree.json` |
| 1. Araştırma | Her yer, ailenin orada yaşadığı yıllar için araştırılır. Bulgular kaynaklı ve dereceli olarak yazılır. Dünya olayları ve "aynanın öbür yüzü" (örneğin mübadelede o köyden kimin gittiği) de eklenir. | `research/dossier.json` |
| 2. Rapor | Bulgular okunur bir rapora dönüşür. Size gösterilir; eksik ya da yanlış bir şey var mı diye sorulur. | `report.html` |
| 3. Hikâye | Sahneler yazılır: tek zaman çizgisi, kollar arasında "o sırada…" geçişleri, bölüm kartları. Seslendirmeden önce taslak size gösterilir. | `video/src/data/story.json` |
| 4. Video | Seslendirme yerelde yapılır ve her cümle yerel konuşma tanımayla kontrol edilir. Ardından video render edilir; ses düzeyi ve yazı titremesi kontrol edilir. | 1080p ve 720p `.mp4` |

### Güven dereceleri

Her bulgu bir derece taşır. Anlatımdaki ifade de bu dereceye göre seçilir:

| Derece | Anlamı | Videoda nasıl söylenir |
|---|---|---|
| belgeli | Birincil ya da güvenilir ikincil kaynakta açıkça geçiyor | Düz cümleyle |
| olası | Kaynaklar güçlü biçimde işaret ediyor | "büyük olasılıkla", "kayıtlar … gösteriyor" |
| aile anlatısı | Ailede ya da köyde anlatılıyor, belgelenmedi | "ailede anlatılana göre" |
| tahmin | Makul ama kanıtsız | "belki de", "… olabilir" |

## Örnek: Örnek ailesi (uydurma)

Bu aile tamamen uydurmadır ve skill'in içinde [`assets/example/`](skills/family-migration-story/assets/example) klasöründe durur. Yerler, tarihler ve kaynaklar gerçektir.

```mermaid
flowchart BT
  ali["Ali Örnek<br/>1895, Selanik"] --> hasan
  emine["Emine Örnek<br/>1900, Selanik"] --> hasan
  hasan["Hasan Örnek<br/>1925, İzmir"] --> murat
  fatma["Fatma Örnek<br/>1930, İzmir"] --> murat
  mehmet["Mehmet Yılmaz<br/>1935, Of"] --> ayse
  zehra["Zehra Yılmaz<br/>1938, Of"] --> ayse
  murat["Murat Örnek<br/>1960, İzmir"] --> deniz
  ayse["Ayşe Örnek<br/>1964, Of"] --> deniz
  deniz["Deniz Örnek<br/>1992, Kadıköy"]
```

Bilinenler bu kadar: doğum yerleri, yıllar ve ailede anlatılan tek bir cümle:

> "1924'te tek bir sandıkla bir vapura binip İzmir'e gelmişler."

Deniz şunu yazıyor:

> Bu soy ağacından Türkçe seslendirmeli bir göç videosu ve kaynaklı bir rapor hazırla. Anne ve baba tarafını tarih sırasıyla karışık anlat.

**Araştırmanın bulduğu** (her biri raporda kaynağıyla):
- **Selanik:** Yüzyıl başında Selanik'in en kalabalık topluluğu Yahudilerdi; şehirde Müslümanlar, Rumlar ve Bulgarlar da yaşıyordu. *(belgeli)*
- **Balkan Savaşı:** Yunan ordusu 8 Kasım 1912'de şehre girdi. Ali o sırada 17 yaşındaydı ve doğduğu şehir artık başka bir devletindi. *(belgeli)*
- **Büyük yangın:** 18 Ağustos 1917'deki yangın şehrin tarihî merkezinin büyük bölümünü yaktı. *(belgeli)*
- **Mübadele:** 30 Ocak 1923'te Lozan'da imzalanan sözleşmeyle Yunanistan'daki Müslümanlar ile Türkiye'deki Rumlar yer değiştirdi. *(belgeli)*
- **Vapur ve sandık:** Ailenin vapur ve sandık hikâyesi aile anlatısı olarak kalıyor. Videoda da öyle söyleniyor: "Ailede anlatılana göre…" *(aile anlatısı)*
- **Soyadı:** 1934'teki Soyadı Kanunu'yla aile "Örnek" soyadını alıyor. *(belgeli)*

**Rapor:**

![Örnek rapor: köken dağılımı, kişiler ve yerlerin tarihi](docs/ornek-rapor.jpg)

**Video** (8 sahne, 18 cümle, 2 dakika 15 saniye). [Videonun tamamını sesiyle izleyin (720p, 5,2 MB)](https://github.com/f/family-migration-story/releases/download/v1.0.0/ornek-aile-720p.mp4).

| | |
|---|---|
| ![1895, Selanik](docs/ornek-selanik.jpg) | ![1923-1924, mübadele yolu](docs/ornek-mubadele.jpg) |
| **1895 · Bir liman kenti.** Hikâye Selanik'te başlar; dönem fotoğrafı ve aile bilgileri ekrana gelir. | **1923-1924 · Bir vapur, bir sandık.** Lozan'daki sözleşme ve ailenin İzmir'e uzanan, temsilî olarak çizilmiş yolu. |
| ![1935, Of](docs/ornek-of.jpg) | ![1895-bugün, bütün aile](docs/ornek-hepsi.jpg) |
| **1935 · O sırada Karadeniz'de.** Anlatım öbür kola geçer: annenin babası Mehmet Of'ta doğar. | **1895-bugün · Bir harita, bir aile.** Bütün yollar ve köken dağılımı bir arada. |

Örneği kendi bilgisayarınızda üretmek kurulumu da sınar; birkaç dakika sürer:

```bash
SKILL=~/.claude/skills/family-migration-story   # plugin kurduysanız: Claude'a skill klasörünün yolunu sorun
zsh $SKILL/scripts/new_project.sh /tmp/ornek/video && cd /tmp/ornek/video
cp $SKILL/assets/example/video-data/*.json src/data/
python3 -I $SKILL/scripts/research/commons_fetch.py $SKILL/assets/example/images.tsv public/img src/data/credits.json
zsh $SKILL/scripts/setup_tts.sh
npm run geo && npm run vo -- --engine yazgi && npm run check && npm run render
```

## Gizlilik

Soy ağaçları yaşayan insanların adlarını, doğum tarihlerini ve yerlerini içerir. Skill bunları şöyle korur:

- **Aramalarda isim kullanılmaz.** Web aramaları, arşiv ve makale API'leri ile görsel aramaları yalnızca yer, yıl ve konu içerir.
- **Ses yerelde üretilir ve yerelde kontrol edilir.** Seslendirme (yazgi-tts, macOS `say`) ve konuşma tanıma (faster-whisper) bilgisayarınızda çalışır; anlatım bir bulut ses servisine gönderilmez.
- **Çıktılar yerel kalır.** Rapor ve video bilgisayarınızda dosya olarak durur; siz istemedikçe hiçbir yere yüklenmez.
- **İsimle kayıt araması sizin onayınızla yapılır.** Yolcu listeleri, arşiv isim dizinleri ve FamilySearch gibi aramalar yalnızca açıkça izin verirseniz yapılır.

Soy ağacınız, Claude ile yaptığınız konuşmanın bir parçası olarak işlenir. Yukarıdaki kurallar, verinin bu konuşmanın dışına (arama motorlarına, arşivlere, ses servislerine) çıkmamasını sağlar.

## Klasör yapısı

```text
.claude-plugin/          plugin ve marketplace tanımı
skills/family-migration-story/
  SKILL.md               iş akışı (Claude'un okuduğu talimatlar)
  references/            araştırma rehberi, bölgelere göre arşivler, hikâye ve video rehberi, veri biçimleri
  scripts/               e-Devlet ve GEDCOM içe aktarma, soy ağacı araçları, araştırma araçları, rapor, ses kontrolü, teslim
  assets/template/       Remotion video projesi şablonu
  assets/example/        uydurma Örnek ailesi
evals/                   `claude plugin eval` ile çalışan iki test senaryosu
docs/                    bu sayfadaki görseller
```

## Sınırlar

- Bu bir araştırma yardımcısıdır, resmî bir soy kaydı değildir. Önemli bulguları raporda verilen kaynaklardan kendiniz kontrol edin.
- Bazı arşivler (Library of Congress, Gallica, Devlet Arşivleri kataloğu) otomatik erişime kapalıdır. Skill bu arşivler için tarayıcıda açabileceğiniz bağlantılar verir.
- Haritadaki sınırlar bugünün sınırlarıdır. Noktalı yollar temsilîdir; ailenin gerçek yolu belgelenmediyse anlatımda da böyle söylenir.

## Katkı

Hata bildirimlerine ve pull request'lere açığım. Özellikle şu konulardaki katkılar işe yarar:
- başka bölgeler için arşiv kaynakları (`references/archives-by-region.md`)
- farklı e-Devlet PDF düzenleri
- başka diller için yerel sesler

Katkıda bulunurken gerçek aile verisi eklemeyin; örnekler uydurma olmalı.

## Lisans

Kod [MIT](LICENSE) lisanslıdır. Kullanılan üçüncü taraf bileşenlerin kendi lisansları vardır:

- **Remotion** kendi lisansıyla dağıtılır. Bireyler ve küçük ekipler için ücretsizdir; daha büyük şirketlerin şirket lisansı alması gerekir ([remotion.dev/license](https://www.remotion.dev/license)).
- **yazgi-tts-1** Apache-2.0, **faster-whisper** MIT lisanslıdır. **Natural Earth** harita verisi kamu malıdır.
- **Wikimedia Commons görselleri** kendi lisanslarıyla kullanılır. Her video, görsellerin yazarını ve lisansını ekranda ve kapanış künyesinde gösterir. Bu sayfadaki örnek karelerdeki fotoğraflar kamu malıdır:
  - Selanik: Bain News Service
  - Trabzon: Dmitri Ermakov
