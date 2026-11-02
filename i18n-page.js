// Trang chỉ có nội dung tĩnh (ủng hộ, quyền riêng tư). Trên web công khai thì giữ nguyên cả hai ngôn ngữ
if (PB_IN_EXTENSION) {
    pbLoadLanguage().then(() => {
        pbApplyTranslations();
        document.querySelectorAll('[data-lang]').forEach((el) => {
            el.hidden = el.dataset.lang !== pbCurrentLanguage;
        });
    });
}
