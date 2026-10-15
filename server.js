
"use strict";

const express = require("express");
const path = require("path");
const PptxGenJS = require("pptxgenjs");

const app = express();
const PORT = process.env.PORT || 10000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname)));

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    service: "KM SERVICES",
    aiConfigured: Boolean(GROQ_API_KEY),
    model: GROQ_MODEL
  });
});

async function askGroq(messages, options = {}) {
  if (!GROQ_API_KEY) {
    const error = new Error("مفتاح Groq غير مضبوط في إعدادات الخادم.");
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
        temperature: options.temperature ?? 0.4,
        max_tokens: options.max_tokens ?? 5000
      }),
      signal: AbortSignal.timeout(120000)
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error("Groq API error:", response.status, data);

    const error = new Error(
      response.status === 429
        ? "تم بلوغ حد الاستخدام لدى Groq. حاول لاحقًا."
        : response.status === 401
        ? "مفتاح Groq غير صحيح. راجع إعدادات Render."
        : response.status === 413
        ? "حجم الطلب كبير جدًا."
        : "تعذر إنشاء الإجابة بالذكاء الاصطناعي: " +
          (data.error?.message || `HTTP ${response.status}`)
    );

    error.status = response.status === 429 ? 429 : 502;
    throw error;
  }

  const content = data.choices?.[0]?.message?.content;

  if (!content || !content.trim()) {
    const error = new Error("لم يرجع الذكاء الاصطناعي محتوى.");
    error.status = 502;
    throw error;
  }

  return content.trim();
}

function sendError(res, error, fallback) {
  console.error(fallback, error.message);

  res.status(error.status || 500).json({
    success: false,
    error: error.message || fallback
  });
}

/* =========================
   مساعد الذكاء الاصطناعي
========================= */

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
          "أنت مساعد محترف لمنصة KM SERVICES. أجب باللغة المطلوبة، ونظّم الإجابة بعناوين واضحة. لا تختلق المراجع أو الروابط أو المعلومات. وضح المعلومات التي تحتاج إلى تحقق."
      },
      { role: "user", content: prompt }
    ]);

    res.json({ success: true, answer });
  } catch (error) {
    sendError(res, error, "حدث خطأ في خدمة الذكاء الاصطناعي.");
  }
});

/* =========================
   إنشاء البحث الجاهز
========================= */

app.post("/api/ai/research", async (req, res) => {
  try {
    const topic = String(req.body?.topic || "").trim();
    const level = String(req.body?.level || "ثانوي").trim();
    const language = String(req.body?.language || "العربية").trim();

    const pages = Math.max(
      1,
      Math.min(30, Math.floor(Number(req.body?.pages) || 5))
    );

    const includeImages =
      req.body?.includeImages === true ||
      req.body?.includeImages === "true";

    const extra = String(req.body?.extra || "").trim();

    if (!topic) {
      return res.status(400).json({
        success: false,
        error: "اكتب موضوع البحث."
      });
    }

    if (topic.length > 500 || extra.length > 3000) {
      return res.status(400).json({
        success: false,
        error: "تجاوز الموضوع أو الملاحظات الحد المسموح."
      });
    }

    const prompt = `
أنشئ بحثًا تعليميًا أصليًا ومنظمًا باللغة: ${language}.

المستوى الدراسي: ${level}
موضوع البحث: ${topic}
عدد الصفحات التقريبي: ${pages}
إضافة الصور: ${includeImages ? "نعم" : "لا"}
ملاحظات المستخدم: ${extra || "لا توجد"}

اكتب البحث وفق الترتيب التالي:

1. صفحة غلاف تتضمن عنوان البحث والمستوى الدراسي، مع ترك أسماء الطالب والمؤسسة والأستاذ قابلة للتعبئة.
2. مقدمة مناسبة.
3. إشكالية البحث.
4. أهداف البحث.
5. خطة البحث والعناصر الرئيسية.
6. فصول ومباحث بعناوين واضحة وشرح كافٍ يناسب المستوى.
7. خاتمة تتضمن أهم النتائج.
8. قائمة المراجع والمصادر.
9. عند طلب الصور، أضف قسمًا بعنوان "الصور المقترحة"، وحدد وصف كل صورة ومكان إدراجها.

شروط:
- اكتب محتوى مفيدًا ومفصلًا يتناسب مع عدد الصفحات المطلوب قدر الإمكان.
- استعمل لغة سليمة وعناوين واضحة وفقرات مترابطة.
- لا تكرر الأفكار لمجرد زيادة الطول.
- لا تدّعِ أنك بحثت في الإنترنت مباشرة.
- لا تخترع أسماء مؤلفين أو كتبًا أو روابط أو تواريخ نشر.
- إذا لم تتأكد من مرجع، اذكر أن بياناته تحتاج إلى التحقق.
- لا تضع صورًا وهمية أو روابط صور غير متحقق منها.
- اجعل الناتج مناسبًا للمعاينة والتحويل إلى Word وPDF وPowerPoint.
- أعد البحث مباشرة دون مقدمة عن طريقة عملك.
`;

    const answer = await askGroq(
      [
        {
          role: "system",
          content:
            "أنت محرر وباحث تعليمي محترف في KM SERVICES. أنشئ أبحاثًا أصلية ومنظمة، وراعِ المستوى الدراسي واللغة المطلوبة. لا تختلق مصادر أو بيانات."
        },
        { role: "user", content: prompt }
      ],
      {
        temperature: 0.4,
        max_tokens: 8000
      }
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
    sendError(res, error, "تعذر إنشاء البحث.");
  }
});

/* =========================
   تصدير البحث إلى PowerPoint
========================= */

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

    if (content.length > 100000) {
      return res.status(400).json({
        success: false,
        error: "محتوى البحث كبير جدًا لإنشاء العرض."
      });
    }

    const pptx = new PptxGenJS();

    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "KM SERVICES";
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

      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: 13.333,
        h: 0.12,
        line: { color: "1688D4", transparency: 100 },
        fill: { color: "1688D4" }
      });

      slide.addText(title, {
        x: 0.6,
        y: first ? 1.25 : 0.4,
        w: 12.1,
        h: first ? 1.4 : 0.85,
        fontFace: "Arial",
        fontSize: first ? 30 : 23,
        bold: true,
        color: "123B64",
        align: "right",
        valign: "mid",
        margin: 0.12,
        breakLine: false,
        rtlMode: true,
        fit: "shrink"
      });

      if (body) {
        slide.addText(body, {
          x: 0.7,
          y: first ? 3 : 1.5,
          w: 11.95,
          h: first ? 2.5 : 5.1,
          fontFace: "Arial",
          fontSize: first ? 21 : 17,
          color: "202B38",
          align: "right",
          valign: "top",
          margin: 0.16,
          paraSpaceAfterPt: 10,
          breakLine: false,
          rtlMode: true,
          fit: "shrink"
        });
      }

      slide.addText("KM SERVICES", {
        x: 0.4,
        y: 7.08,
        w: 12.5,
        h: 0.2,
        fontFace: "Arial",
        fontSize: 9,
        color: "54708A",
        align: "center"
      });
    };

    addTextSlide(
      topic,
      "بحث تعليمي مُعدّ بواسطة KM SERVICES",
      true
    );

    const clean = content
      .replace(/\r/g, "")
      .replace(/^#{1,6}\s*/gm, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .trim();

    const paragraphs = clean
      .split(/\n\s*\n/)
      .map(part => part.trim())
      .filter(Boolean);

    let currentTitle = "محتوى البحث";
    let currentBody = "";

    const sections = [];

    for (const paragraph of paragraphs) {
      const isHeading =
        paragraph.length <= 100 &&
        !paragraph.includes(". ") &&
        !paragraph.includes("،") &&
        !paragraph.includes("؟") &&
        !paragraph.includes("\n");

      if (isHeading && currentBody.trim()) {
        sections.push({
          title: currentTitle,
          body: currentBody.trim()
        });

        currentTitle = paragraph.replace(/^[\d٠-٩]+[.)\-:]\s*/, "");
        currentBody = "";
        continue;
      }

      if (isHeading && !currentBody.trim()) {
        currentTitle = paragraph.replace(/^[\d٠-٩]+[.)\-:]\s*/, "");
        continue;
      }

      const pieces = paragraph.match(/[\s\S]{1,1200}/g) || [paragraph];

      for (const piece of pieces) {
        if ((currentBody + "\n" + piece).length > 2600) {
          sections.push({
            title: currentTitle,
            body: currentBody.trim()
          });

          currentTitle = "متابعة " + currentTitle;
          currentBody = piece;
        } else {
          currentBody += (currentBody ? "\n\n" : "") + piece;
        }
      }
    }

    if (currentBody.trim()) {
      sections.push({
        title: currentTitle,
        body: currentBody.trim()
      });
    }

    for (const section of sections.slice(0, 18)) {
      addTextSlide(
        section.title.slice(0, 100),
        section.body.slice(0, 2600)
      );
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
      `attachment; filename="KM-SERVICES-${encodeURIComponent(safeName)}.pptx"`
    );

    res.send(Buffer.from(buffer));
  } catch (error) {
    sendError(res, error, "تعذر إنشاء عرض PowerPoint.");
  }
});

/* =========================
   الصفحات والمسارات
========================= */

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
  console.log(`KM SERVICES running on port ${PORT}`);
  console.log(`AI configured: ${Boolean(GROQ_API_KEY)}`);
  console.log(`AI model: ${GROQ_MODEL}`);
});
