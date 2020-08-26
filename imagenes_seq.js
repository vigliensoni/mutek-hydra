window.onload = function () {
  const hydra = new Hydra()
  const photoPath = ['fotos/Interiores_pintura/1File.jpg', 'fotos/Interiores_pintura/2File.jpg', 'fotos/Interiores_pintura/3File.jpg']
  const n = photoPath.length


  let image0 = new Image()

  image0.onload = () => s0.init({src:image0, dynamic:false})
  image0.crossOrigin = "anonymous"


  // s0.initCam()

  src(s0).blend(o0, .75).scrollX(({time})=>time*.01).scale(2).repeat(2.5).rotate(1.047).out()


  let i = 0
  setInterval(changephoto, 3000);

  function changephoto() {
      image0.src = photoPath[i%n];
      i++
    }

}
