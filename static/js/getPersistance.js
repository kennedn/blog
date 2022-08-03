document.addEventListener('DOMContentLoaded', function() {
    var blogBG = sessionStorage.getItem('lastColor');
    if (blogBG) {
        document.body.style.backgroundColor = blogBG;
    } else {
        document.body.style.backgroundColor = '#dd2264';
    }
}); 