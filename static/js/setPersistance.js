document.addEventListener('DOMContentLoaded', function() {
  var uls = document.getElementsByClassName('note list');
  if (uls.length == 0) {return;}
  var ul = uls[0];
  ul.addEventListener('click', e => { 
    var liColor = getComputedStyle(e.target.closest('li')).getPropertyValue('background-color');
    sessionStorage.setItem('lastColor', liColor);
    localStorage.setItem('lastColor', liColor);
  }); 
});
 