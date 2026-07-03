import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding LingoDeck demo data...");

  // Demo user - in production a User row is created lazily on first
  // authenticated request (see src/middleware/auth.ts). This lets you
  // browse the seeded data with `npm run db:studio` before wiring Clerk up.
  const user = await prisma.user.upsert({
    where: { clerkId: "demo_user_clerk_id" },
    update: {},
    create: {
      clerkId: "demo_user_clerk_id",
      email: "demo@lingodeck.app",
      name: "Cheso",
      currentStreak: 27,
      longestStreak: 31,
    },
  });

  const achievements = [
    { key: "STREAK_7", title: "7 Day Streak", description: "Studied 7 days in a row", icon: "🔥" },
    { key: "STREAK_30", title: "30 Day Streak", description: "Studied 30 days in a row", icon: "🔥" },
    { key: "STREAK_100", title: "100 Day Streak", description: "Studied 100 days in a row", icon: "🔥" },
    { key: "WORDS_100", title: "100 Words", description: "Learned 100 words", icon: "📘" },
    { key: "WORDS_500", title: "500 Words", description: "Learned 500 words", icon: "📗" },
  ];
  for (const a of achievements) {
    await prisma.achievement.upsert({ where: { key: a.key }, update: {}, create: a });
  }

  const collectionsData = [
    { name: "English Basics", icon: "📗", color: "#22c55e" },
    { name: "Fantasy Novel", icon: "🐉", color: "#8b5cf6" },
    { name: "Game Development", icon: "🎮", color: "#3b82f6" },
    { name: "Business", icon: "💼", color: "#f59e0b" },
    { name: "Daily Conversation", icon: "💬", color: "#ec4899" },
  ];
  const collections: Record<string, string> = {};
  for (const c of collectionsData) {
    const created = await prisma.collection.create({ data: { ...c, userId: user.id } });
    collections[c.name] = created.id;
  }

  const tagsData = ["IELTS", "TOEIC", "Novel", "Movie", "Anime", "Game", "Work", "KKU"];
  const tags: Record<string, string> = {};
  for (const name of tagsData) {
    const created = await prisma.tag.create({ data: { name, userId: user.id } });
    tags[name] = created.id;
  }

  const wordsData = [
    {
      headword: "Apple", meaning: "แอปเปิล", ipa: "/ˈæpəl/", type: "NOUN", level: "A1",
      example: "I eat an apple every morning.", exampleTranslate: "ฉันกินแอปเปิลทุกเช้า",
      synonym: "fruit", opposite: null, frequency: 5, image: "🍎",
      collection: "English Basics", tagNames: ["KKU"],
    },
    {
      headword: "Ancient", meaning: "โบราณ", ipa: "/ˈeɪnʃənt/", type: "ADJECTIVE", level: "B1",
      example: "They found ancient ruins in the desert.", exampleTranslate: "พวกเขาพบซากปรักหักพังโบราณในทะเลทราย",
      synonym: "old", opposite: "modern", frequency: 3, image: "🏛️",
      collection: "Fantasy Novel", tagNames: ["Novel", "IELTS"],
    },
    {
      headword: "Angry", meaning: "โกรธ", ipa: "/ˈæŋɡri/", type: "ADJECTIVE", level: "A1",
      example: "She was angry when the bus was late.", exampleTranslate: "เธอโกรธตอนที่รถบัสมาสาย",
      synonym: "mad", opposite: "calm", frequency: 4, image: "😠",
      collection: "Daily Conversation", tagNames: [],
    },
    {
      headword: "Pretend", meaning: "แสร้งทำ", ipa: "/prɪˈtend/", type: "VERB", level: "B1",
      example: "He pretended not to see me.", exampleTranslate: "เขาแสร้งทำเป็นไม่เห็นฉัน",
      synonym: "fake", opposite: null, frequency: 2, image: "🎭",
      collection: "Fantasy Novel", tagNames: ["Novel"],
    },
    {
      headword: "Instead", meaning: "แทนที่จะ", ipa: "/ɪnˈsted/", type: "ADVERB", level: "A2",
      example: "Let's walk instead of taking the bus.", exampleTranslate: "เราเดินแทนที่จะนั่งรถบัสกันเถอะ",
      synonym: "rather", opposite: null, frequency: 3, image: "🔁",
      collection: "English Basics", tagNames: ["TOEIC"],
    },
    {
      headword: "Available", meaning: "ว่าง / มีให้ใช้งาน", ipa: "/əˈveɪləbl/", type: "ADJECTIVE", level: "B1",
      example: "Is this seat available?", exampleTranslate: "ที่นั่งนี้ว่างไหม",
      synonym: "free", opposite: "occupied", frequency: 4, image: "✅",
      collection: "Business", tagNames: ["Work", "TOEIC"],
    },
    {
      headword: "Quest", meaning: "ภารกิจ", ipa: "/kwest/", type: "NOUN", level: "B2",
      example: "The hero accepted the quest to save the kingdom.", exampleTranslate: "วีรบุรุษรับภารกิจกอบกู้อาณาจักร",
      synonym: "mission", opposite: null, frequency: 3, image: "🗺️",
      collection: "Game Development", tagNames: ["Game"],
    },
    {
      headword: "Take off", meaning: "ถอด (เสื้อผ้า) / เครื่องบินขึ้น", ipa: "-", type: "PHRASE", level: "B1",
      example: "The plane will take off at 6pm.", exampleTranslate: "เครื่องบินจะออกเดินทางตอน 6 โมงเย็น",
      synonym: "-", opposite: "land", frequency: 4, image: "✈️",
      collection: "Daily Conversation", tagNames: ["TOEIC"],
    },
    {
      headword: "Orange", meaning: "ส้ม", ipa: "/ˈɒrɪndʒ/", type: "NOUN", level: "A1",
      example: "She squeezed an orange for juice.", exampleTranslate: "เธอคั้นน้ำส้ม",
      synonym: "fruit", opposite: null, frequency: 5, image: "🍊",
      collection: "English Basics", tagNames: [],
    },
    {
      headword: "Banana", meaning: "กล้วย", ipa: "/bəˈnɑːnə/", type: "NOUN", level: "A1",
      example: "Monkeys love bananas.", exampleTranslate: "ลิงชอบกล้วย",
      synonym: "fruit", opposite: null, frequency: 4, image: "🍌",
      collection: "English Basics", tagNames: [],
    },
  ] as const;

  const createdWords: Record<string, string> = {};
  for (const w of wordsData) {
    const { collection, tagNames, ...rest } = w;
    const word = await prisma.word.create({
      data: {
        ...rest,
        status: "LEARNING",
        userId: user.id,
        collectionId: collections[collection],
        tags: { create: tagNames.map((name) => ({ tagId: tags[name] })) },
      },
    });
    createdWords[w.headword] = word.id;
  }

  // Word relationship "mindmap": happy -> joy -> cheerful -> delighted -> ecstatic
  const chain = ["Happy", "Joy", "Cheerful", "Delighted", "Ecstatic"];
  const chainIds: string[] = [];
  for (const headword of chain) {
    const word = await prisma.word.create({
      data: {
        headword, meaning: "มีความสุข", type: "ADJECTIVE", level: "A2",
        status: "NEW", userId: user.id, collectionId: collections["English Basics"],
        frequency: 3, image: "😊",
      },
    });
    chainIds.push(word.id);
  }
  for (let i = 0; i < chainIds.length - 1; i++) {
    await prisma.wordRelation.create({ data: { fromId: chainIds[i], toId: chainIds[i + 1], label: "synonym chain" } });
  }

  await prisma.sentenceBookmark.create({
    data: {
      text: "Actions speak louder than words.",
      translation: "การกระทำสำคัญกว่าคำพูด",
      userId: user.id,
    },
  });

  await prisma.article.create({
    data: {
      title: "The Boy Who Lived",
      category: "Harry Potter",
      content:
        "Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal, thank you very much. It was on the corner of the street that Mr. Dursley noticed the first sign of something ancient and peculiar...",
      userId: user.id,
    },
  });

  console.log("Seed complete:", {
    user: user.email,
    words: wordsData.length + chain.length,
    collections: collectionsData.length,
    tags: tagsData.length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
