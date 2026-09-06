# 🍦 הר גלידה — ניהול ועד הגן

אפליקציית React מחוברת ל-Supabase: לוגין (אימייל + סיסמה), הרשאות
אמיתיות (אדמין / צופה), ונתונים משותפים לכל חברות הועד.

---

## הקמה מהירה

### 1. Supabase — מסד הנתונים
1. היכנסי ל-[supabase.com](https://supabase.com) → New Project.
2. פתחי **SQL Editor** → הדביקי את `har-glida-schema.sql` → **Run**.
3. **Authentication → Providers → Email**: ודאי שמופעל, וכבי את
   **"Confirm email"** (אין צורך באישור — הגישה מבוקרת דרך allowed_emails).
4. **יצירת משתמשות מראש**: Authentication → Users → **Add user** →
   מלאי אימייל + סיסמה וסמני **Auto Confirm User**. חזרי לכל חברת ועד.
5. לכל משתמשת, הוסיפי את המייל שלה ל-`allowed_emails` עם התפקיד:
   ```sql
   insert into allowed_emails (email, role) values ('me@gmail.com','admin');
   insert into allowed_emails (email, role) values ('a@gmail.com','viewer');
   ```

### 2. הפרויקט — הרצה מקומית
```bash
npm install
cp .env.example .env      # מלאי את הערכים מ-Supabase → Settings → API
npm run dev               # http://localhost:5173
```
את `VITE_SUPABASE_URL` ו-`VITE_SUPABASE_ANON_KEY` לוקחים מ:
**Supabase → Project Settings → API** (URL + anon public key).

### 3. פרסום (Vercel)
1. דחפי את הקוד ל-GitHub.
2. ב-[vercel.com](https://vercel.com) → Import Project → בחרי את הריפו.
3. הוסיפי את שני משתני הסביבה (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).
4. Deploy. הכתובת שתקבלי — הוסיפי אותה ב-Supabase → URL Configuration.

---

## ניהול משתמשים (הכל בטבלה אחת)

```sql
-- הוספת אדמין
insert into allowed_emails (email, role) values ('x@gmail.com','admin');

-- הוספת צופות
insert into allowed_emails (email, role) values ('a@gmail.com','viewer');

-- שינוי תפקיד
update allowed_emails set role='admin' where email='a@gmail.com';

-- הסרת גישה
delete from allowed_emails where email='x@gmail.com';
```
המייל = הזהות. יוצרים משתמשות מראש (Authentication → Users → Add user,
עם Auto Confirm). אין הרשמה עצמית.

**שכחה סיסמה?** אין איפוס עצמי (זה דורש מייל). האדמין מאפס ידנית:
Authentication → Users → בחרי את המשתמשת → Reset / Update password.

---

## הרשאות (נאכפות ב-DB דרך RLS)
| פעולה | אדמין | צופה |
|---|---|---|
| צפייה בהכל | ✅ | ✅ |
| עריכת קופות / תשלומים / הוצאות / ייבוא | ✅ | ❌ |
| אישור בקשות החזר | ✅ | ❌ |
| הגשת בקשת החזר | ✅ | ✅ |
| תכנון הוצאות | ✅ | ✅ |
| הוספת/מחיקת אירועים | ✅ | ✅ |

---

## מבנה
```
src/
  supabaseClient.js  — חיבור ל-Supabase
  db.js              — טעינת נתונים + פונקציית getRole
  sync.js            — שמירת שינויים (diff → Supabase)
  Login.jsx          — מסך התחברות (אימייל + סיסמה)
  App.jsx            — האפליקציה (קופות, החזרים, תכנון, אירועים, ילדים)
  main.jsx           — auth gate (Login / App / אין גישה)
```

הלוגיקה (דדופ, חישובים, ייבוא פייבוקס, ולידציית יתרה) זהה לאב-הטיפוס —
רק שכבת האחסון הוחלפה מ-localStorage ל-Supabase.
