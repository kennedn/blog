document.addEventListener('DOMContentLoaded', function() {
    document.body.style.backgroundColor = sessionStorage.getItem('lastColor') || '#dd2264';
}); 