ul = document.getElementsByClassName('note list')[0];
ul.addEventListener('click', e => { 
  let li = e.target.closest('li');
}); 
