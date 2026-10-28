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

ไฟล์จะอยู่ที่ `release/Lemix-Studio-0.2.0.exe` การแพ็กครั้งแรกอาจดาวน์โหลดเครื่องมือของ electron-builder เพิ่มเติม ยังไม่มีใบรับรองสำหรับลงลายเซ็นโปรแกรม

## เครื่องมือที่ใช้ได้

- **Arrangement:** หลายแทร็กสูงสุด 24 แทร็ก แสดง waveform จากข้อมูลเสียงจริง ลากคลิปเพื่อเลื่อนตำแหน่ง โดย snap ทุก ¼ beat, seek, zoom และ loop
- **แต่งจังหวะ:** drum machine 16 steps มี kick, snare, hi-hat และ clap กดช่องเพื่อเปิดหรือปิดเสียง
- **แต่งทำนอง:** note grid สำหรับ bass และ keys; pad สร้างคอร์ดบรรยากาศให้ โดยแพตเทิร์นซ้ำทุกห้องและ progression เปลี่ยนทุก 2 ห้อง
- **นำเข้าเสียง:** เลือกไฟล์หรือลาก WAV, MP3, OGG, FLAC และไฟล์เสียงที่ Chromium รองรับลงในแอป ไฟล์ละไม่เกิน 108 MB และยาวไม่เกิน 10 นาที
- **AI Vocal Remover:** แยกเสียงร้องออกจากเพลงด้วย MDX-Net ในเครื่อง บันทึกดนตรีเป็น WAV หรือเพิ่มเป็นแทร็กใหม่เพื่อรีมิกซ์ต่อได้ พร้อม progress และ cancel
- **Clip tools:** เลื่อนจุดเริ่มต้น, trim จากต้นเสียง, reverse และ playback speed 0.5–2×; การเปลี่ยน speed เปลี่ยน pitch ด้วย
- **มิกซ์เสียง:** volume, stereo pan, mute/solo และมิกเซอร์รวมทุกแทร็ก
- **ปรับคุณภาพและโทนเสียง:** EQ 3 ย่าน, low-pass filter, drive, compressor, convolution room reverb และ dotted delay พร้อม master limiter
- **จัดการงาน:** ตั้งชื่อแทร็ก, duplicate/delete, undo/redo 24 ขั้นตอน และเตือนก่อนปิดงานที่ยังไม่ได้บันทึก
- **บันทึก `.lemix`:** เก็บการตั้งค่า แพตเทิร์น และไฟล์เสียงที่นำเข้าไว้ในโปรเจกต์เดียว ขนาดรวมไม่เกิน 300 MB โดยไทม์ไลน์รองรับเพลงเต็ม ความยาวรวมไม่เกินประมาณ 10 นาที
- **ส่งออก WAV:** มิกซ์เป็น stereo PCM 16-bit / 44.1 kHz พร้อม effect tail อีก 2 วินาที ใช้สายเอฟเฟกต์เดียวกับที่เล่นสด

## วิธีลองทำเพลง

1. เปิดโปรแกรมแล้วกด **Space** เพื่อฟังเดโม “Midnight in motion”
2. เลือกแทร็กกลองและเปลี่ยน steps ใน Pattern editor หรือเพิ่มเครื่องดนตรีจาก Sound library
3. เลือก bass หรือ keys แล้วกดช่องโน้ตเพื่อเขียนทำนอง หรือใช้ **Import** นำเพลงของคุณเข้ามารีมิกซ์
4. ลากคลิปบนไทม์ไลน์เพื่อจัดตำแหน่ง แล้วปรับ EQ / filter / effects ใน Channel strip ด้านขวา ซึ่งเลื่อนดูเครื่องมือเพิ่มเติมได้
5. เปิด Mixer เพื่อปรับระดับเสียงและตำแหน่ง stereo ของแต่ละแทร็ก
6. กด **Ctrl+S** บันทึกโปรเจกต์ และกด **Export WAV** เมื่อพอใจกับเสียงแล้ว

| คีย์ลัด | การทำงาน |
| --- | --- |
| Space | เล่น / หยุดชั่วคราว |
| Ctrl / ⌘ + S | บันทึกโปรเจกต์ |
| Ctrl / ⌘ + O | เปิดโปรเจกต์ |
| Ctrl / ⌘ + Z | Undo |
| Ctrl / ⌘ + Shift + Z หรือ Ctrl+Y | Redo |

Space และ Undo จะไม่แย่งการพิมพ์ข้อความจากช่องกรอกข้อมูล ขณะโฟกัสปุ่ม Space จะสั่งงานปุ่มนั้นตามปกติ

## ทดสอบ

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run test:electron
```

Unit tests ตรวจ project validation, mute/solo, WAV headers/interleaving/clipping และ synthesis ที่ให้ผลซ้ำได้ ส่วน Electron smoke test เปิดแอปจริง ตรวจ renderer isolation, waveform, pattern editing, mute/solo, effects, undo/redo, นำเข้าเสียง, playback meter, native save, WAV export และเปิดโปรเจกต์ที่ฝังไฟล์เสียงกลับมา

Smoke test แสดงหน้าต่างชั่วครู่เพื่อจับภาพก่อนซ่อนหน้าต่าง ผลทดสอบและภาพหน้าจออยู่ใน `artifacts/` ซึ่งไม่ถูก commit การทดสอบวัดสัญญาณเสียงด้วยซอฟต์แวร์ ไม่ได้ยืนยันเสียงผ่านลำโพงหรืออุปกรณ์เสียงทุกแบบ

หลังสร้างแอปด้วย `npm.cmd run dist` สามารถทดสอบซ้ำโดยโหลดโค้ดและ renderer จาก `app.asar` ที่แพ็กแล้วด้วย `node scripts/test-electron.mjs --packaged`

## ตัดเสียงร้องด้วย AI

1. นำเข้าเพลง แล้วเลือกแทร็กเสียงนั้น
2. กด **Vocal Remover** ในแถบซ้าย หรือ **Remove vocals** ใน editor
3. กด **Remove vocals** เพื่อเริ่มทำงาน ครั้งแรกโปรแกรมจะดาวน์โหลดโมเดลประมาณ **67 MB** และตรวจ SHA-256 ก่อนใช้ ต้องมีอินเทอร์เน็ตในครั้งนี้
4. รอแถบความคืบหน้า ระหว่างประมวลผลกด **Cancel separation** หรือ Escape เพื่อยกเลิกได้ โดยไม่เปลี่ยนไฟล์ต้นฉบับ
5. เลือก **Save WAV** เพื่อบันทึกดนตรีทั้งเพลง หรือ **Add instrumental track** เพื่อเพิ่มเข้าไทม์ไลน์ โปรแกรมจะ mute ต้นฉบับ รักษา offset, trim, speed, reverse และเอฟเฟกต์เดิมไว้ในแทร็กใหม่ พร้อมขยายไทม์ไลน์เท่าที่จำเป็น ใช้ Undo กลับสู่มิกซ์ก่อนเพิ่มแทร็กได้

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
src/synthesis.ts   สร้างกลอง bass keys และ pad ด้วย PCM
src/audio.ts       Web Audio graph, transport และ offline rendering
src/main.ts        หน้าจอ, เครื่องมือแต่งเพลง และประวัติ undo/redo
src/style.css      ธีมสตูดิโอ, layout และ accessibility states
tests/             Unit tests
scripts/           Dev launcher และการทดสอบ Electron จริง
```

Renderer เปิด `contextIsolation` และ sandbox ปิด Node integration และ remote navigation มี CSP และตรวจข้อมูลก่อนบันทึกผ่าน IPC ตาม [แนวทางความปลอดภัยของ Electron](https://www.electronjs.org/docs/latest/tutorial/security/)

รุ่นนี้เป็นสตูดิโอเริ่มต้นสำหรับแต่งลูปและรีมิกซ์ ยังไม่มี VST/AU, บันทึกไมโครโฟน, MIDI hardware, time-stretch แบบรักษา pitch, automation หรือแยก stems เป็น drums/bass/guitar แยกกัน หนึ่งแทร็กมีหนึ่งคลิป/แพตเทิร์น และยังไม่มี autosave จึงควรบันทึกโปรเจกต์เป็นระยะ
