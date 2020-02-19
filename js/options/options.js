import { storage } from '../storage.js';
import { environment } from '../environment.js'

const $ = document.querySelector.bind(document);
const $s = document.querySelectorAll.bind(document);
const username = $('#username')
const password = $('#password')

showPage('authentication', 'Authentication')

function setInputValue(input, value) {
    console.log('onChange', input.id, value)
    if (typeof value === 'boolean') {
        input.checked = value;
    } else {
        if (input.attributes['type'].value === 'range') input.MaterialSlider && input.MaterialSlider.change(value);
        else input.value = value;
    }
}
// storage.onChange().subscribe()
storage.onChange().subscribe( appData => {
    Object.keys(appData).forEach( key => {
        $s(`div.option input[id='${key}']`)
            .forEach( input => setInputValue(input, appData[key]))
    })
    console.log(appData);
    if (appData.apiKey) {
        $('#loginDiv').style.display = 'none'
        $s('.usernameSlug').forEach(
            slug => slug.innerHTML = appData.username )
        $('#logoutDiv').style.display = ''
    }
});

$s('div.option input[type="checkbox"]').forEach( el => {
    storage.appDataAsync().then( store => el.checked = store[el.name] );
    el.addEventListener( 'change', (event) => {
        const { name, checked } = event.target;
        storage.setAppData({
            [name]: checked
        })
    })
});

$('#login').addEventListener('click', () => {
    console.log('login clicked')
    const [usernameVal, passwordVal] = [username.value, password.value]
    $('#password').value = ''
    clearElement(password)
    login(usernameVal, passwordVal).then( () => {
        $('#loginDiv').style.display = 'none'
        writeSlug('usernameSlug', username)
        $('#logoutDiv').style.display = ''
        // clear login inputs
        clearElement(username)
    }).catch( error => {
        console.log('in error catch')
        if (error && error.error === 'auth_failed') {
            setError('invalid-creds')
        } else {
            setError('technical-error')
        }
        clearElement(username)
    })
})
$('#logout').addEventListener('click', () => {
    console.log('logout clicked')
    logout()
})

$('#authenticationNavLink').addEventListener('click', e => {
    e.preventDefault()
    showPage('authentication', 'Authentication')
})
$('#optionsNavLink').addEventListener('click', e => {
    e.preventDefault()
    showPage('options', 'Options')
})
$('#paymentNavLink').addEventListener('click', e => {
    e.preventDefault()
    showPage('payment', 'Payment')
})
$('#logoutLink').addEventListener('click', e => {
    logout()
    showPage('authentication', 'Authentication')
})

async function login(username, password) {
    let formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    const { apiKey } = await fetch(`${environment.baseUrl}/account/api/`, {
        method: 'POST', 
        body: formData,
    }).then( res => res.json() )
        .then( response => {
            if (!response.apikey) {
                return new Promise( (res, rej) => rej(response) )
            }
            return response
        })
        .then( res => ({apiKey: res.apikey}))
        // .catch( err => console.error(err) )

    return storage.setAppData({
        username,
        apiKey
    })

}

function logout() {
    clearElement(username)
    clearElement(password)

    storage.setAppData({
        apiKey: null,
        username: null
    }).then()
    $('#loginDiv').style.display = ''
    $('#logoutDiv').style.display = 'none'
}

function clearElement(el) {
    el.value = ''
    el.parentElement.classList.remove('is-dirty')
}
function setError(loginError) {
    $s(`.login-error:not(#${loginError})`).forEach( el => el.style.display = 'none');
    if (loginError) {
        $(`#${loginError}`).style.display = 'block';
    }
}

function writeSlug(slugId, text) {
    $s(`.${slugId}`).forEach( slug => slug.textContent = text)
}

function showPage(pageId, pageTitle) {
    // hide pages not this page
    $s(`section:not(.${pageId})`).forEach( page => page.style.display = 'none')
    // show page this page
    $(`section.${pageId}`).style.display = 'block'
    // set page title slug
    writeSlug('pageTitleSlug', pageTitle)
}