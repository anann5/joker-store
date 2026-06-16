#!/bin/bash

# Joker Store Auto-Push Script 🃏

echo "---------------------------------------"
echo "🚀 جاري بدء عملية الرفع إلى GitHub..."
echo "---------------------------------------"

# 1. إضافة كل التغييرات (يتجاهل الملفات في .gitignore تلقائياً)
git add .
echo "✅ تمت إضافة الملفات إلى منطقة التجهيز."

# 2. طلب رسالة الـ Commit
read -p "📝 أدخل رسالة التحديث (أو اضغط Enter لاستخدام تاريخ اليوم): " commit_msg
if [ -z "$commit_msg" ]; then
  commit_msg="تحديث تلقائي بتاريخ: $(date)"
fi

git commit -m "$commit_msg"

# 3. الرفع إلى الفرع الرئيسي
echo "📡 جاري الرفع إلى GitHub (Main branch)..."
git push origin main

echo "---------------------------------------"
echo "🎉 تم الرفع بنجاح! ريندر (Render) سيبدأ النشر الآن."
echo "---------------------------------------"