@echo off
chcp 65001 >nul
title إعداد جدار حماية نظام الترزي — فتح منفذ الربط 3141

:: فحص صلاحيات المسؤول
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] جاري طلب صلاحيات المسؤول (Administrator)...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo =======================================================
echo     نظام الترزي — فتح منفذ الربط الشبكي (3141)
echo =======================================================
echo.
echo جاري فك حظر المنفذ 3141 في جدار حماية ويندوز لجميع أنواع الشبكات...
echo.

netsh advfirewall firewall delete rule name="EL-Tarzy Bag Station Port 3141" >nul 2>&1
netsh advfirewall firewall add rule name="EL-Tarzy Bag Station Port 3141" dir=in action=allow protocol=TCP localport=3141 profile=any >nul 2>&1

if %errorlevel% equ 0 (
    echo [✓] تم السماح لمنفذ 3141 في جدار الحماية بنجاح!
    echo [✓] الآن يمكن للجهاز الثاني (محطة الأكياس) الاتصال بهذا الجهاز بدون أي حظر.
) else (
    echo [X] تعذر إضافة القاعدة تلقائياً. يرجى التأكد من تشغيل الملف كمسؤول.
)

echo.
echo =======================================================
echo اضغط أي مفتاح للإغلاق...
pause >nul
