document.addEventListener('DOMContentLoaded', function() {
  Array.from(document.getElementsByClassName('note list'), ul => {
    ul.addEventListener('click', e => { 
      var liColor = getComputedStyle(e.target.closest('li')).getPropertyValue('background-color');
      sessionStorage.setItem('lastColor', liColor);
      localStorage.setItem('lastColor', liColor);
    }); 
  });
});
 