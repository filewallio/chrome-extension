


window.addEventListener('load', function () {
    // ga('send', 'pageview', '/extension/show');
    console.log('in popup/popup.js')

    // browser.runtime.getBackgroundPage().then((page) => {

    //     for (var index in page.active_downloads) {
    //         page.active_downloads[index].render();
    //     };

    //     if (page.active_downloads == 0) {
    //         document.getElementById('head').style.display = "block";
    //     } else {
    //         document.getElementById('head').style.display = "none";
    //     }

    // });

    let optionsButton = document.getElementById('options-open');

    optionsButton.onclick = () => {
        browser.runtime.openOptionsPage();
    };

});
