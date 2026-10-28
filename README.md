# Lemix Studio

โปรแกรมแต่งเพลงและรีมิกซ์เสียงสำหรับเดสก์ท็อป สร้างด้วย **Electron + TypeScript + Vite** ใช้ Web Audio ประมวลผลเสียงจริง ทำงานออฟไลน์โดยไม่ต้องมีบัญชีหรือส่งไฟล์เสียงไปยังเซิร์ฟเวอร์

## เริ่มใช้งาน

ต้องมี Node.js **22.18+ หรือ 24+** และ npm การติดตั้งครั้งแรกต้องใช้อินเทอร์เน็ตเพื่อดาวน์โหลด dependencies และ Electron runtime

```powershell
npm.cmd ci
npm.cmd run dev
```

บน PowerShell ใช้ `npm.cmd` ได้แม้เครื่องปิดการรันไฟล์ `npm.ps1` อยู่ บน macOS/Linux ใช้ `npm` ตามปกติ

เปิดโปรแกรมจาก production build:

```powershell
npm.cmd run build
npm.cmd start
```

สร้างแอป Windows แบบ portable:

```powershell
npm.cmd run dist
```

ไฟล์จะอยู่ที่ `release/Lemix-Studio-0.5.0.exe` การแพ็กครั้งแรกอาจดาวน์โหลดเครื่องมือของ electron-builder เพิ่มเติม ยังไม่มีใบรับรองสำหรับลงลายเซ็นโปรแกรม

## เครื่องมือที่ใช้ได้

- **Arrangement:** สูงสุด 24 layers และ 512 คลิป วางหลายไฟล์ใน layer เดียวได้ ลากคลิปข้าม layer, ตัดแบ่งด้วย Razor, trim ทั้งสองขอบ และทำสำเนา/ลบโดยไม่ตัดทับต้นฉบับ พร้อม waveform, snap ที่เปิด/ปิดได้, seek, zoom และ loop
- **แต่งจังหวะ:** drum machine 16 steps มี kick, snare, hi-hat และ clap กดช่องเพื่อเปิดหรือปิดเสียง
- **Sound Library:** เครื่องดนตรี 9 แบบ ได้แก่ Drum machine, Analog bass, Electric keys, Ambient pad, Studio piano, Nylon guitar, Wood marimba, Drawbar organ และ Synth lead พร้อมค้นหาและเลื่อนรายการได้
- **แต่งทำนอง:** note grid สำหรับ bass, keys และเครื่องดนตรีใหม่ทั้ง 5 แบบ โดยแสดง octave ตามเสียงที่เล่นจริง; pad สร้างคอร์ดบรรยากาศให้ แพตเทิร์นซ้ำทุกห้องและ progression เปลี่ยนทุก 2 ห้อง
- **นำเข้าเสียง:** เลือกไฟล์หรือลาก WAV, MP3, OGG, FLAC และไฟล์เสียงที่ Chromium รองรับลงในแอป ไฟล์ละไม่เกิน 108 MB และยาวไม่เกิน 10 นาที
- **AI Vocal Remover:** แยกเสียงร้องออกจากเพลงด้วย MDX-Net ในเครื่อง บันทึกดนตรีเป็น WAV หรือเพิ่มเป็นแทร็กใหม่เพื่อรีมิกซ์ต่อได้ พร้อม progress และ cancel
- **Audio Repair:** ลาก Noise Reduction, Click / Pop Repair หรือ Clean Audio ลงบนคลิปเพื่อลดเสียงซ่าและซ่อมคลิก/ช็อตสั้น ๆ ปรับความแรง, Bypass เทียบต้นฉบับ และ Undo ได้ ใช้ทั้งตอนเล่นและส่งออก WAV
- **Clip tools:** gain และ mute รายคลิป, reverse, playback speed 0.5–2× และปรับเอฟเฟกต์แยกจาก Layer mixer; การเปลี่ยน speed เปลี่ยน pitch ด้วย
- **มิกซ์เสียง:** volume, stereo pan, mute/solo และมิกเซอร์รวมทุกแทร็ก
- **ปรับคุณภาพและโทนเสียง:** EQ 3 ย่าน, low-pass filter, drive, compressor, convolution room reverb และ dotted delay พร้อม master limiter
- **จัดการงาน:** ตั้งชื่อแทร็ก, duplicate/delete, undo/redo 24 ขั้นตอน และเตือนก่อนปิดงานที่ยังไม่ได้บันทึก
- **บันทึก `.lemix`:** เก็บการตั้งค่า แพตเทิร์น และไฟล์เสียงที่นำเข้าไว้ในโปรเจกต์เดียว ขนาดรวมไม่เกิน 300 MB โดยไทม์ไลน์รองรับเพลงเต็ม ความยาวรวมไม่เกินประมาณ 10 นาที
- **ส่งออก WAV:** มิกซ์เป็น stereo PCM 16-bit / 44.1 kHz พร้อม effect tail อีก 2 วินาที ใช้สายเอฟเฟกต์เดียวกับที่เล่นสด

## วิธีลองทำเพลง

1. เปิดโปรแกรมแล้วกด **Space** เพื่อฟังเดโม “Midnight in motion”
2. เลือกแทร็กกลองและเปลี่ยน steps ใน Pattern editor หรือเพิ่มเครื่องดนตรีจาก Sound library
3. เลือก bass, keys, piano, guitar, marimba, organ หรือ lead แล้วกดช่องโน้ตเพื่อเขียนทำนอง หรือใช้ **Import** นำเพลงของคุณเข้ามารีมิกซ์
4. ลากคลิปบนไทม์ไลน์เพื่อจัดตำแหน่ง แล้วปรับ EQ / filter / effects ใน Channel strip ด้านขวา ซึ่งเลื่อนดูเครื่องมือเพิ่มเติมได้
5. เปิด Mixer เพื่อปรับระดับเสียงและตำแหน่ง stereo ของแต่ละแทร็ก
6. กด **Ctrl+S** บันทึกโปรเจกต์ และกด **Export WAV** เมื่อพอใจกับเสียงแล้ว

| คีย์ลัด | การทำงาน |
| --- | --- |
| Space | เล่น / หยุดชั่วคราว |
| V | เครื่องมือ Select สำหรับลากคลิป |
| C | เครื่องมือ Razor กดบนคลิปเพื่อตัดตรงนั้น |
| S | ตัดคลิปที่เลือกตรง playhead |
| Ctrl / ⌘ + D | ทำสำเนาคลิปต่อท้าย |
| Delete / Backspace | ลบเฉพาะคลิปที่เลือก |
| Ctrl / ⌘ + S | บันทึกโปรเจกต์ |
| Ctrl / ⌘ + O | เปิดโปรเจกต์ |
| Ctrl / ⌘ + Z | Undo |
| Ctrl / ⌘ + Shift + Z หรือ Ctrl+Y | Redo |

Space และ Undo จะไม่แย่งการพิมพ์ข้อความจากช่องกรอกข้อมูล ขณะโฟกัสปุ่ม Space จะสั่งงานปุ่มนั้นตามปกติ

## ตัดต่อคลิปแบบหลาย layers

1. กด **Add layer** เพื่อสร้าง layer ว่าง หรือนำเข้าไฟล์จากแถบซ้ายเพื่อสร้าง layer พร้อมคลิป
2. ลากไฟล์เสียงลงบนตำแหน่งใน layer เพื่อแทรกเสียงตรงนั้น หรือเลือก layer แล้วกด **Add audio** เพื่อแทรกตรง playhead
3. ใช้ **Select (V)** ลากตัวคลิปไปทางซ้าย/ขวาหรือข้าม layer ได้ หากเลื่อนเสียงเลยขอบไทม์ไลน์ โปรแกรมจะขยายความยาวให้ภายในขีดจำกัด
4. ใช้ **Razor (C)** กดบนจุดที่ต้องการตัด หรือวาง playhead แล้วกด **Split (S)** จะได้คลิปสองชิ้นที่อ้างอิงเสียงต้นฉบับเดียวกัน
5. ลากขอบซ้าย/ขวาของคลิปเพื่อตัดช่วงต้น/ท้าย และลากกลับเพื่อคืนช่วงเสียงที่ซ่อนไว้ ปิด **SNAP** หากต้องการตัดละเอียดกว่า ¼ beat
6. เลือกคลิปแล้วปรับ **Clip effects** ด้านขวาเพื่อเปลี่ยน gain, mute, EQ, filter, drive, compressor, reverb หรือ delay เฉพาะชิ้นนั้น ส่วน **Layer mixer** ปรับรวมทุกคลิปใน layer
7. กด **Ctrl+D** เพื่อทำสำเนาคลิป หรือ **Delete** เพื่อลบคลิป ใช้ Undo/Redo ย้อนการตัด ย้าย trim และเอฟเฟกต์ได้

คลิปที่ทับกันใน layer เดียวจะแสดงเป็นแถวซ้อนและเล่นผสมกัน คลิปที่ตัดหรือทำสำเนาใช้ไฟล์ต้นฉบับร่วมกัน จึงไม่เพิ่มสำเนาไฟล์เสียงในโปรเจกต์ แพตเทิร์นกลอง/โน้ตเป็น source ร่วมเช่นกัน การแก้โน้ตจะมีผลกับคลิปที่อ้างอิงแพตเทิร์นชุดนั้น ส่วนเอฟเฟกต์และ gain รายคลิปแยกกัน

โปรแกรมเปิด `.lemix` รูปแบบ v1/v2 เดิมและแปลงเป็นรูปแบบ v3 ให้อัตโนมัติ โดยเก็บเสียง จังหวะเวลา reverse/speed และเอฟเฟกต์เดิมไว้ ไฟล์ที่บันทึกด้วยรุ่นนี้ต้องเปิดด้วย **0.5 ขึ้นไป** เพื่อให้การตั้งค่า Audio Repair ไม่หาย หากยังใช้แอปรุ่นเก่าให้เก็บสำเนาไฟล์เดิมไว้ด้วย

## ลดเสียงซ่าและเสียงคลิก/ช็อต

1. เปิดแท็บ **Audio FX** ทางซ้าย แล้วเลือก **Noise Reduction**, **Click / Pop Repair** หรือ **Clean Audio** ที่รวมทั้งสองอย่าง
2. ลากการ์ดเอฟเฟกต์ไปวางบนคลิปที่ต้องการ คลิปจะขึ้นกรอบสีเขียวระหว่างลากและมีป้าย **REPAIR** หลังใส่เอฟเฟกต์ หรือเลือกคลิปแล้วกดการ์ดเอฟเฟกต์เพื่อใช้งานผ่านปุ่ม/คีย์บอร์ดได้
3. ปรับใน **Clip effects → Audio Repair** ด้านขวา:
   - **Noise reduction:** ความแรงในการลดเสียงซ่าและเสียงพื้นหลังระดับต่ำ เริ่มประมาณ 30–65% แล้วฟังเทียบ
   - **Noise floor:** ระดับที่ใช้แยกเสียงพื้นหลัง เริ่มที่ −42 dB หากเพิ่มเป็นค่าที่ติดลบน้อยลงจะกรองมากขึ้น แต่อาจลดเสียงหลักเบา ๆ หรือหางเสียงด้วย
   - **Click / pop repair:** ความแรงในการซ่อมเสียงกระตุกสั้น ๆ จากการตรวจการเปลี่ยนแปลงของ waveform แล้วประมาณช่วงเสียงทดแทน
4. กด **Bypass / A–B** เพื่อฟังต้นฉบับสลับกับเสียงที่ผ่านเอฟเฟกต์ ปุ่มถังขยะในส่วน Audio Repair ลบเฉพาะการซ่อมเสียง ส่วน Undo/Redo ย้อนการเพิ่ม ลบ และปรับค่าได้
5. กด Play หรือ Export WAV เพื่อประมวลผลเสียง การตั้งค่าจะถูกเก็บในโปรเจกต์ และคลิปที่ตัด/ทำสำเนาจะแก้ค่าแยกกันได้

เอฟเฟกต์นี้ประมวลผลในเครื่องผ่าน Web Worker และไม่ต้องดาวน์โหลดโมเดลเพิ่ม รองรับ mono/stereo งานเตรียมเสียงก่อนเล่นหยุดได้ด้วย Stop ไฟล์ต้นฉบับและข้อมูลเสียงที่ฝังในโปรเจกต์ไม่ถูกเขียนทับ และ waveform บนไทม์ไลน์ยังแสดงต้นฉบับอยู่

Noise Reduction ใช้ spectral attenuation ตาม Noise floor ที่ตั้งไว้ ไม่ได้เรียนรู้ noise profile อัตโนมัติ ส่วน Click / Pop Repair เน้นเสียงกระตุกที่สั้นประมาณไม่เกิน 3 ms จึงอาจซ่อมเสียงแตกยาว เสียงลม/เสียงพูดแทรก หรือ clipping รุนแรงไม่ได้ทั้งหมด การกรองแรงเกินไปอาจกระทบรายละเอียดของดนตรี ควรใช้ Bypass เทียบเสมอ ดูความแตกต่างของปัญหาแต่ละแบบได้ใน [คู่มือ Noise Removal & Repair ของ Audacity](https://www.audacityteam.org/manual/effects/noise-removal-and-repair/)

## เครื่องดนตรีใหม่ในรุ่น 0.4

| เครื่องดนตรี | ลักษณะเสียง |
| --- | --- |
| Studio piano | คีย์เปียโนใส พร้อมเสียงที่ค่อย ๆ จาง |
| Nylon guitar | เสียงดีดนุ่ม โทนอุ่น เล่นในย่านเสียงต่ำกว่าคีย์เปียโน |
| Wood marimba | เสียงไม้กระทบสั้นและสดใส |
| Drawbar organ | เสียงออร์แกนยาวที่มีฮาร์โมนิกหลายชั้น |
| Synth lead | ซินธ์นำโทนสว่างและคม |

กดชื่อเครื่องดนตรีใน **Sound Library** เพื่อเพิ่ม layer พร้อมแพตเทิร์นเริ่มต้น จากนั้นแต่งโน้ตใน **Pattern editor** และปรับ Clip effects / Layer mixer ได้ตามเดิม ช่องค้นหาและตำแหน่งรายการจะคงอยู่เมื่อเพิ่มเสียงหรือแก้ไขโปรเจกต์

ทั้ง 5 แบบเป็นเสียงสังเคราะห์ในแอป ใช้งานออฟไลน์โดยไม่ต้องติดตั้ง plugin หรือดาวน์โหลด sample เพิ่ม ไม่ใช่ sample บันทึกเครื่องดนตรีจริง เครื่องดนตรีเหล่านี้เริ่มรองรับใน 0.4 ส่วนไฟล์ที่บันทึกด้วยแอปปัจจุบันต้องเปิดด้วย **0.5 ขึ้นไป**

## ทดสอบ

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run test:electron
```

Unit tests ตรวจการย้ายข้อมูลโปรเจกต์เก่า, source/clip references, split/trim/move, clip FX ที่ไม่ใช้ object ร่วมกัน, การวางแถวคลิปซ้อน, mute/solo, WAV และ synthesis ส่วน Electron smoke test ใช้หน้าจอจริงเพื่อตัดคลิป ย้ายข้าม layer ลากขอบทั้งสองข้าง ทำสำเนา/ลบ Undo และปรับ gain/FX รายคลิป แล้วตรวจ PCM ของ WAV ว่าช่วงเสียงและช่วงเงียบตรงกับไทม์ไลน์ รวมถึงตรวจ workflow เดิมและการเปิดไฟล์รุ่นเก่า

เครื่องดนตรีใหม่มีการตรวจเสียงที่ไม่เป็น NaN/Infinity, การจบโน้ต, การปิดแพตเทิร์นให้เงียบ และการบันทึกชนิดเครื่องดนตรี ใน Electron จะค้นหา เพิ่ม และแต่งโน้ตของทั้ง 5 แบบทีละเครื่อง จากนั้น Solo และส่งออก WAV เพื่อยืนยันว่าได้สัญญาณเสียงและแต่ละเครื่องให้ผลลัพธ์ต่างกัน

Audio Repair มี unit tests สำหรับการลดเสียงซ่าใต้เสียงหลัก, click/burst repair, stereo phase, bypass ที่ไม่เปลี่ยนข้อมูล, ค่า PCM ที่ผิดรูปแบบ, การแยกค่าของคลิป และการเปิดไฟล์ v2 เดิม ใน Electron จะจำลองการลากเอฟเฟกต์ลงคลิป ส่งออกไฟล์เสียงที่ใส่ hiss/pop ไว้ แล้ววัด noise energy, ระดับเสียงหลัก และ pop peak รวมถึงตรวจว่า Bypass ส่งออกได้เหมือนต้นฉบับ ข้อมูลต้นฉบับยังอยู่ครบ และหยุดการเตรียมเสียงได้ ผลทดสอบอยู่ใน `artifacts/repair-before.wav`, `repair-after.wav` และ `repair-metrics.json` ซึ่งเป็นสัญญาณทดสอบ ไม่ใช่การรับประกันผลกับทุกไฟล์เสียง

Smoke test แสดงหน้าต่างชั่วครู่เพื่อจับภาพก่อนซ่อนหน้าต่าง ผลทดสอบและภาพหน้าจออยู่ใน `artifacts/` ซึ่งไม่ถูก commit การทดสอบวัดสัญญาณเสียงด้วยซอฟต์แวร์ ไม่ได้ยืนยันเสียงผ่านลำโพงหรืออุปกรณ์เสียงทุกแบบ

หลังสร้างแอปด้วย `npm.cmd run dist` สามารถทดสอบซ้ำโดยโหลดโค้ดและ renderer จาก `app.asar` ที่แพ็กแล้วด้วย `node scripts/test-electron.mjs --packaged`

## ตัดเสียงร้องด้วย AI

1. นำเข้าเพลง แล้วเลือกแทร็กเสียงนั้น
2. กด **Vocal Remover** ในแถบซ้าย หรือ **Remove vocals** ใน editor
3. กด **Remove vocals** เพื่อเริ่มทำงาน ครั้งแรกโปรแกรมจะดาวน์โหลดโมเดลประมาณ **67 MB** และตรวจ SHA-256 ก่อนใช้ ต้องมีอินเทอร์เน็ตในครั้งนี้
4. รอแถบความคืบหน้า ระหว่างประมวลผลกด **Cancel separation** หรือ Escape เพื่อยกเลิกได้ โดยไม่เปลี่ยนไฟล์ต้นฉบับ
5. เลือก **Save WAV** เพื่อบันทึกดนตรีทั้งเพลง หรือ **Add instrumental track** เพื่อเพิ่ม layer พร้อมคลิปใหม่ โปรแกรมจะ mute เฉพาะคลิปต้นฉบับที่เลือก รักษา offset, trim, ความยาว, speed, reverse, gain และเอฟเฟกต์ไว้ โดยไม่ mute คลิปอื่นใน layer เดิม ใช้ Undo กลับสู่มิกซ์ก่อนเพิ่มคลิปได้

การแยกใช้เสียงต้นฉบับเต็มไฟล์ ก่อนผ่าน clip tools และเอฟเฟกต์ ส่วน Save WAV ในเครื่องมือนี้ส่งออก instrumental เต็มไฟล์ หากต้องการรวมเอฟเฟกต์และแทร็กอื่นให้ใช้ Export WAV ของสตูดิโอแทน

โมเดลเก็บใน `models/` ภายใน userData ของแอป หลังดาวน์โหลดแล้วใช้งานออฟไลน์ได้ การประมวลผลอยู่ใน utility process ของ Electron ใช้ CPU และ **ไม่อัปโหลดไฟล์เพลง** ไม่ต้องติดตั้ง Python หรือมี API key รองรับ mono/stereo; เพลงยาวไม่เกิน 10 นาที การแยกอาจใช้เวลาหลายนาทีและใช้ RAM มากตามความยาวเพลง

ผลลัพธ์ขึ้นอยู่กับเพลง อาจมีเสียงร้อง/คอรัสเหลือหรือเสียงดนตรีบางส่วนได้รับผลกระทบ โมเดลที่ใช้คือ [UVR MDX-Net Inst HQ 3](https://github.com/TRvlvr/model_repo/releases/tag/all_public_uvr_models) ผ่าน [ONNX Runtime](https://github.com/microsoft/onnxruntime/tree/main/js/node) โดยตั้งค่า FFT และ gain compensation ตาม [ข้อมูลโมเดลของ UVR](https://github.com/TRvlvr/application_data/blob/main/mdx_model_data/model_data.json)

ทดสอบเครื่องมือนี้กับโมเดลจริง:

```powershell
npm.cmd run build
node scripts/test-electron.mjs --separation
node scripts/test-electron.mjs --packaged --separation
```

การทดสอบครั้งแรกจะดาวน์โหลดโมเดลเข้า `artifacts/test-profile/models/` โดยตรวจการแยกจริง, WAV, การรักษาต้นฉบับ/การตั้งค่าคลิป, Undo, cancel และการปฏิเสธ input ที่ผิดรูปแบบ เพิ่ม `--speech` เพื่อดาวน์โหลดเสียงพูดตัวอย่างจาก [PyTorch / VOiCES](https://github.com/pytorch/audio/blob/main/examples/tutorials/audio_feature_augmentation_tutorial.py) และวัดการลดเสียงคนผ่านหลายหน้าต่างประมวลผล ตัวอย่างเสียงเป็น CC BY 4.0 โดย Lab41 / SRI; ไฟล์และผลวัดอยู่ใน `artifacts/speech-*` และไม่ถูกรวมในแอปหรือ commit

## โครงสร้าง

```text
electron/          Main process, native save และ preload bridge ที่จำกัดขอบเขต
electron/separation*.ts  ดาวน์โหลดโมเดล, worker และ STFT สำหรับ AI Vocal Remover
src/model.ts       ชนิดข้อมูล, validation, project defaults และ WAV encoder
src/timeline.ts    คำนวณช่วงคลิป, split/trim/move และแถวของคลิปที่ทับกัน
src/synthesis.ts   สร้างเสียงเครื่องดนตรีทั้ง 9 แบบด้วย PCM
src/cleanup*.ts    DSP ลดเสียงซ่า/คลิกและ worker สำหรับการซ่อมเสียงรายคลิป
src/audio.ts       Web Audio graph, transport และ offline rendering
src/main.ts        หน้าจอ, เครื่องมือแต่งเพลง และประวัติ undo/redo
src/style.css      ธีมสตูดิโอ, layout และ accessibility states
tests/             Unit tests
scripts/           Dev launcher และการทดสอบ Electron จริง
```

Renderer เปิด `contextIsolation` และ sandbox ปิด Node integration และ remote navigation มี CSP และตรวจข้อมูลก่อนบันทึกผ่าน IPC ตาม [แนวทางความปลอดภัยของ Electron](https://www.electronjs.org/docs/latest/tutorial/security/)

รุ่นนี้ยังไม่มี crossfade อัตโนมัติ, automation, VST/AU, บันทึกไมโครโฟน, MIDI hardware, time-stretch แบบรักษา pitch หรือแยก stems เป็น drums/bass/guitar แยกกัน และยังไม่มี autosave จึงควรบันทึกโปรเจกต์เป็นระยะ
