"use strict";

const express = require("express");
const path = require("path");
const PptxGenJS = require("pptxgenjs");

const app = express();
const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL =
  process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname)));

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "PrintoraKM",
    aiConfigured: Boolean(GROQ_API_KEY),
    model: GROQ_MODEL
  });
});

async function askGroq(messages, options = {}) {
  if (!GROQ_API_KEY) {
    const error = new Error(
      "مفتاح الذكاء الاصطناعي غير مضبوط في إعدادات الخادم."
    );
    error.status = 503;
    throw error;
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages,
        temperature: options.temperature ?? 0.5,
        max_tokens: options.max_tokens ?? 5000
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Groq API error:", response.status, data);

    const error = new Error(
      response.status === 429
        ? "وصلت إلى حد الاستخدام المتاح للذكاء الاصطناعي. حاول لاحقًا."
        : response.status === 401
        ? "مفتاح Groq غير صحيح. راجع إعدادات Render."
        : data.error?.message || "تعذر الاتصال بالذكاء الاصطناعي."
    );

    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    const error = new Error("لم يرجع الذكاء الاصطناعي محتوى.");
    error.status = 502;
    throw error;
  }

  return content;
}

app.post("/api/ai", async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: "اكتب الطلب أولًا."
      });
    }

    if (prompt.length > 30000) {
      return res.status(400).json({
        success: false,
        error: "الطلب طويل جدًا."
      });
    }

    const answer = await askGroq([
      {
        role: "system",
        content:
          "أنت مساعد محترف لمنصة PrintoraKM. أجب باللغة التي يطلبها المستخدم، ونظّم الإجابة بعناوين واضحة. لا تخترع مراجع أو أرقام صفحات أو مصادر. إذا لم تكن متأكدًا من معلومة، وضح ذلك."
      },
      { role: "user", content: prompt }
    ]);

    res.json({ success: true, answer });
  } catch (error) {
    console.error("AI error:", error.message);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || "حدث خطأ في الخادم."
    });
  }
});

app.post("/api/ai/research", async (req, res) => {
  try {
    const topic = String(req.body?.topic || "").trim();
    const level = String(req.body?.level || "ثانوي").trim();
    const language = String(req.body?.language || "العربية").trim();
    const pages = Math.max(
      1,
      Math.min(30, Number(req.body?.pages) || 5)
    );
    const includeImages = Boolean(req.body?.includeImages);
    const extra = String(req.body?.extra || "").trim();

    if (!topic) {
      return res.status(400).json({
        success: false,
        error: "اكتب موضوع البحث."
      });
    }

    if (topic.length > 500) {
      return res.status(400).json({
        success: false,
        error: "موضوع البحث طويل جدًا."
      });
    }

    const prompt = `
أنشئ بحثًا تعليميًا منظمًا باللغة: ${language}.

المستوى الدراسي: ${level}
موضوع البحث: ${topic}
الطول التقريبي المطلوب: ${pages} صفحات
هل يريد المستخدم صورًا؟ ${includeImages ? "نعم، اقترح أماكن وصورًا مناسبة لإضافتها لاحقًا" : "لا"}
ملاحظات إضافية: ${extra || "لا توجد"}

اكتب البحث بهذه البنية:
العنوان
مقدمة
إشكالية البحث
أهداف البحث
العناصر الرئيسية بعناوين فرعية واضحة
خاتمة
قائمة مراجع ومصادر مقترحة

شروط مهمة:
- اجعل المحتوى مناسبًا للمستوى الدراسي المحدد.
- لا تخترع مراجع أو روابط أو أسماء مؤلفين أو تواريخ نشر.
- إذا لم تكن متأكدًا من مصدر، اكتب بوضوح: "يجب التحقق من بيانات هذا المصدر".
- لا تدّعِ أنك بحثت في الإنترنت مباشرة.
- إذا طُلبت الصور، ضع في النهاية قسم "صور مقترحة" مع وصف كل صورة ومكان إدراجها.
- استخدم نصًا منظمًا يمكن تحويله إلى Word وPDF.
- أعد المحتوى مباشرة دون كلام تمهيدي عن طريقة عملك.
`;

    const answer = await askGroq(
      [
        {
          role: "system",
          content:
            "أنت محرر وباحث تعليمي. أنشئ محتوى أصليًا منظمًا، وميّز بين الحقائق المؤكدة والمعلومات التي تحتاج إلى تحقق. لا تخترع مراجع."
        },
        { role: "user", content: prompt }
      ],
      { temperature: 0.4, max_tokens: 7000 }
    );

    res.json({
      success: true,
      research: {
        topic,
        level,
        language,
        pages,
        includeImages,
        content: answer,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Research error:", error.message);
    res.status(error.status || 500).json({
      success: false,
      error: error.message || "تعذر إنشاء البحث."
    });
  }
});

app.post("/api/powerpoint", async (req, res) => {
  try {
    const topic = String(req.body?.topic || "بحث تعليمي").trim();
    const content = String(req.body?.content || "").trim();

    if (!content) {
      return res.status(400).json({
        success: false,
        error: "أنشئ البحث أولًا."
      });
    }

    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "PrintoraKM";
    pptx.subject = topic;
    pptx.title = topic;
    pptx.lang = "ar-DZ";
    pptx.theme = {
      headFontFace: "Arial",
      bodyFontFace: "Arial",
      lang: "ar-DZ"
    };

    const addTextSlide = (title, body, first = false) => {
      const slide = pptx.addSlide();
      slide.background = { color: "F4F8FC" };

      slide.addText(title, {
        x: 0.55,
        y: first ? 1.2 : 0.35,
        w: 12.2,
        h: first ? 1.2 : 0.8,
        fontFace: "Arial",
        fontSize: first ? 30 : 24,
        bold: true,
        color: "123B64",
        align: "right",
        margin: 0.12,
        breakLine: false,
        valign: "mid"
      });

      if (body) {
        slide.addText(body, {
          x: 0.65,
          y: first ? 3 : 1.45,
          w: 12,
          h: first ? 2.6 : 5.2,
          fontFace: "Arial",
          fontSize: 17,
          color: "202B38",
          align: "right",
          valign: "top",
          breakLine: false,
          paraSpaceAfterPt: 10,
          margin: 0.15,
          fit: "shrink"
        });
      }

      slide.addText("PrintoraKM", {
        x: 0.4,
        y: 7.05,
        w: 12.5,
        h: 0.25,
        fontFace: "Arial",
        fontSize: 9,
        color: "54708A",
        align: "center"
      });
    };

    addTextSlide(topic, "عرض تعليمي مُعدّ بواسطة PrintoraKM", true);

    const clean = content
      .replace(/\r/g, "")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .trim();

    const chunks = clean
      .split(/\n(?=[^\n]{2,90}\n)/)
      .flatMap(section => {
        const lines = section.split("\n");
        const pieces = [];
        let buffer = "";

        for (const line of lines) {
          if ((buffer + "\n" + line).length > 750) {
            if (buffer.trim()) pieces.push(buffer.trim());
            buffer = line;
          } else {
            buffer += (buffer ? "\n" : "") + line;
          }
        }

        if (buffer.trim()) pieces.push(buffer.trim());
        return pieces;
      })
      .filter(Boolean)
      .slice(0, 18);

    for (let i = 0; i < chunks.length; i++) {
      const lines = chunks[i].split("\n").filter(Boolean);
      const title = (lines.shift() || `الجزء ${i + 1}`).slice(0, 90);
      const body = [lines.join("\n") || chunks[i]]
        .join("")
        .slice(0, 1800);

      addTextSlide(title, body);
    }

    const buffer = await pptx.write({ outputType: "nodebuffer" });

    const safeName =
      topic
        .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60) || "research";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="PrintoraKM-${encodeURIComponent(safeName)}.pptx"`
    );

    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("PowerPoint error:", error);
    res.status(500).json({
      success: false,
      error: "تعذر إنشاء عرض PowerPoint."
    });
  }
});

app.get("*path", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      error: "المسار غير موجود."
    });
  }

  res.sendFile(path.join(__dirname, "index.html"), error => {
    if (error) next(error);
  });
});

app.use((error, _req, res, _next) => {
  console.error("Server error:", error);
  res.status(500).json({
    success: false,
    error: "حدث خطأ داخلي في الخادم."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PrintoraKM running on port ${PORT}`);
  console.log(`AI configured: ${Boolean(GROQ_API_KEY)}`);
});
