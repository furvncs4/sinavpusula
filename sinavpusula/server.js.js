const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const Anthropic = require('@anthropic-ai/sdk');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `Sen bir eğitim kurumunda rehberlik öğretmenlerine (PDR) karar desteği sağlayan analitik bir yapay zeka bileşenisin.

KESİN KURALLAR:
1. Asla klinik tanı veya tıbbi teşhis koyma. "Depresyon", "anksiyete bozukluğu", "tükenmişlik sendromu" gibi ifadeler KESİNLİKLE YASAKTIR.
2. Analiz tek bir günlük check-in verisine dayanmaktadır. Tek bir günden "kronik uyku açığı" veya uzun dönemli trend iddiasında bulunma. Yalnızca "Bugünkü check-in'de X saat uyku bildirildi" şeklinde gözlem yap.
3. Rehberlik terminolojisini kullan: "İnceleme önerilir", "Birden fazla sinyal gözlendi", "İnsan değerlendirmesi önerilir".
4. Yanıtını YALNIZCA geçerli bir JSON formatında ver. Markdown (\`\`\`json) veya JSON dışı hiçbir metin ekleme.

ÇIKTI JSON ŞEMASI:
{
  "summary": "Tekil kontrole dayanan 1-2 cümlelik nesnel özet.",
  "signals": [
    {
      "category": "sleep | stress | academic | focus",
      "observation": "Gözlenen nesnel durum",
      "severity": "low | medium | high"
    }
  ],
  "reviewRecommended": true,
  "priority": "low | medium | high",
  "reason": "Rehber öğretmenin öğrenciyi neden gözlemlemesi gerektiğine dair temkinli açıklama",
  "counselorQuestions": [
    "Rehber öğretmenin sorabileceği açık uçlu soru 1",
    "Soru 2"
  ],
  "limitations": [
    "Bu değerlendirme tek bir check-in verisine dayanmaktadır; trend çıkarımı yapılamaz.",
    "Bu sistem klinik bir tanı aracı değildir; insan değerlendirmesi esastır."
  ]
}`;

app.post('/api/analyze', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: '.env dosyasında ANTHROPIC_API_KEY tanımlı değil.' });
    }

    const { studentName, stressLevel, sleepHours, mockScore, studentNote } = req.body;

    if (!studentName || typeof studentName !== 'string') {
      return res.status(400).json({ error: 'Öğrenci adı geçerli değil.' });
    }
    const stress = Number(stressLevel);
    if (isNaN(stress) || stress < 1 || stress > 10) {
      return res.status(400).json({ error: 'Stres seviyesi 1 ile 10 arasında olmalıdır.' });
    }
    const sleep = Number(sleepHours);
    if (isNaN(sleep) || sleep < 0 || sleep > 24) {
      return res.status(400).json({ error: 'Uyku süresi 0 ile 24 saat arasında olmalıdır.' });
    }
    const score = Number(mockScore);
    if (isNaN(score) || score < 0) {
      return res.status(400).json({ error: 'Deneme puanı negatif olamaz.' });
    }

    const promptPayload = {
      studentReference: "ogrenci_demo_ref",
      stressLevel: stress,
      sleepHours: sleep,
      mockScore: score,
      studentNote: (studentNote || '').substring(0, 1000)
    };

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      temperature: 0.1,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Aşağıdaki tekil check-in verisini incele ve JSON formatında döndür:\n\n${JSON.stringify(promptPayload)}`
        }
      ]
    });

    const rawText = response.content[0].text.trim();
    let cleanJson = rawText;
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsedData = JSON.parse(cleanJson);

    return res.json({
      success: true,
      model: CLAUDE_MODEL,
      data: parsedData
    });

  } catch (error) {
    console.error('Claude API Hatası:', error.message);
    return res.status(500).json({
      error: 'Claude API çağrısı sırasında bir hata oluştu: ' + error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Sunucu aktif: http://localhost:${PORT}`);
  console.log(`Model: ${CLAUDE_MODEL}`);
});