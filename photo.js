// const Hydra = require('hydra-synth')

// var myElement = document.createElement('img'); // <img />
// myElement.src = 'PabloPIMP.jpeg';    // <img src=" " />


document.body.requestFullscreen()


window.onload = function () {
  const hydra = new Hydra()
  const photoPath = ['img/hola.png', 'img/GVM.jpg', 'img/pk_400.png']
  const n = photoPath.length


  let imagine = new Image()
  imagine.onload = () => s0.init({src:imagine, dynamic:false})
  imagine.crossOrigin = "anonymous"


  src(s0)
  .colorama( ({time}) => Math.sin(time/5) )
  .out(o0)

  let i = 0
  setInterval(changephoto, 750);
  
  function changephoto() {
      imagine.src = photoPath[i%n];
      i++
    }
    
}

