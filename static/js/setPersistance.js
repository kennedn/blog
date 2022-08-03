document.addEventListener('DOMContentLoaded', function() {
  var uls = document.getElementsByClassName('note list');
  if (uls.length == 0) {return;}
  var ul = uls[0];
  ul.addEventListener('click', e => { 
    var li = e.target.closest('li');
    sessionStorage.setItem('lastColor', getComputedStyle(e.target.closest('li')).getPropertyValue('background-color'));
  }); 
});
 