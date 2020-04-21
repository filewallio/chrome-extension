import { filewall } from './filewall.js'
import { BehaviorSubject } from 'rxjs';
import { storage } from './storage.js';
import { uuid } from 'uuidv4'
import { logout } from './authentication'
import { distinctUntilKeyChanged, filter, take } from 'rxjs/operators';

const browser = require('webextension-polyfill');

class Downloader {
    constructor() {
        this.activeDownloads = [];
        this.activeDownload$ = new BehaviorSubject([])
        this.catchedDownloads = {};
        this.wasConfirmedDirectUrls = {};
        this.actions$ = new BehaviorSubject()
        this.lastId = 0;
        browser.runtime.onConnect.addListener( port => {
            if (port.name === 'active-downloads') {
                const subscription = this.activeDownload$.subscribe( activeDownloads => {
                    if (!activeDownloads) return
                    port.postMessage(activeDownloads)
                })
    
                port.onDisconnect.addListener( port => {
                    subscription.unsubscribe();
                })
            } else if (port.name === 'actions') {
                const subscription = this.actions$.subscribe( message => {
                    if (!message) return
                    port.postMessage(message)
                    // browser.browserAction.setBadgeText({text: '!'})
                })
    
                port.onDisconnect.addListener( port => {
                    subscription.unsubscribe();
                })
                port.onMessage.addListener( actions => {
                    console.log('actions to downloader', actions)
                    if (actions['clear']) {
                        this.actions$.next({})
                    }
                    else if (actions['delete-download-item']) {
                        this.removeAciveDownload(actions['delete-download-item'])
                    }
                    browser.browserAction.setBadgeText({text: ''})
                })
            } else if (port.name === 'dialog') {
                // listen for messages from the dialog
            }

        })
        this.activeDownload$.subscribe( next => {
            const { length } = next
            if (length === 0) {
                browser.browserAction.setBadgeText({text: ''})
            } else {
                browser.browserAction.setBadgeBackgroundColor({color:'#6f8d00'})
                browser.browserAction.setBadgeText({text: `${length}`})
            }
        })
        storage.onChange().pipe(
            distinctUntilKeyChanged('apiKey')
        ).subscribe( store => {
            const { apiKey, username } = store
            if (!apiKey) {
                browser.browserAction.setBadgeBackgroundColor({color:'#f80'})
                browser.browserAction.setBadgeText({text: '?'})
            } else {
                browser.browserAction.setBadgeText({text: ''})
            }
        })
    }

    addCatchedDownload(browserDownloadId, downloadUrl, targetTab) {
        console.log('addCatchedDownload',browserDownloadId,  downloadUrl)
        var download_id = uuid(); // our uuid,
        var dialogurl = browser.runtime.getURL("dialog/dialog.html") + "?download_id=" + download_id;
        this.catchedDownloads[download_id] = {
            browserDownloadId: browserDownloadId,
            url: downloadUrl,
            targetTab: targetTab,
            filename: downloadUrl.substring(downloadUrl.lastIndexOf('/') + 1),
            dialogShown: false,
        };

        setTimeout( () => {
            if(this.catchedDownloads[download_id].dialogShown === false){ // timeout if onDetermineFilename fires late for whatever reason and setFilenameForCatchedDownload is not triggered
                this.showDialog(download_id);
            }
        }, 500);

        setTimeout( () => {
            this.hideDialog(download_id);
            delete this.catchedDownloads[download_id];
        }, 60 * 1000); // hide or timeout after 60 sec.
    }

    setFilenameForCatchedDownload(browserDownloadId, filename){
        for (const key of Object.keys(this.catchedDownloads)) {
            if(this.catchedDownloads[key].browserDownloadId === browserDownloadId){
                this.catchedDownloads[key].filename = filename;
                this.showDialog(key);
            }
        }
    }

    wasConfirmedDirect(downloadUrl) {
        if (this.wasConfirmedDirectUrls[downloadUrl] === true) {
            delete this.wasConfirmedDirectUrls[downloadUrl];
            return true;
        }
        return false;
    }

    confirmCatchedDownload(download_id, action) {
        console.log("confirmCatchedDownload")
        if ( action === "direct") {
            this.wasConfirmedDirectUrls[this.catchedDownloads[download_id].url] = true;
            browser.downloads.download({ url: this.catchedDownloads[download_id].url });
            delete this.catchedDownloads[download_id];
        }
        if ( action === "filewall") {
            this.addDownload(this.catchedDownloads[download_id].url, this.catchedDownloads[download_id].filename );
            delete this.catchedDownloads[download_id];
        }
        this.hideDialog(download_id);
    }

    addDownload(downloadUrl, filename) {
        // take text after last '/' as filename for now, use content disposition later
        if (!filename) {
            filename = downloadUrl.substring(downloadUrl.lastIndexOf('/') + 1);
        }

        let downloadItem = {
            downloadUrl,
            filename,
            id: this.lastId++
        }
        chrome.tabs.query({active: true}, function (tabs) {
            tabs.forEach(function (tab) {
                chrome.tabs.sendMessage(tab.id, { target: "animation", action: "start"});
            })
        });

        const downloadItemSubscription = filewall.process(downloadItem).subscribe( downloadItem => {
                this.updateStatus(downloadItem)
                const {status, filename, pollStatus} = downloadItem;
                this.activeDownload$.next( this.activeDownloads.map(this.sanitizeItem) )
                
                if (status === 'finished') {
                    console.log('downloaded', downloadItem)
                    chrome.tabs.query({active: true}, function (tabs) {
                        tabs.forEach(function (tab) {
                            chrome.tabs.sendMessage(tab.id, { target: "animation", action: "success"});
                        })
                    });

                    this.removeAciveDownload(downloadItem)
                    browser.downloads.download({
                        url: pollStatus.links.download,
                    });
                }
            }, response => {
                console.log('downloadItemSubscription error', response)
                const { error, status } = response
                this.updateStatus({
                    ...downloadItem,
                    error,
                    status
                })
                this.activeDownload$.next( this.activeDownloads.map(this.sanitizeItem) )
                console.log('errorMap', error);
                const errorMap = {
                    'auth_failed': async _ => {
                        // 304 Fobidden remove download-item
                        this.removeAciveDownload(downloadItem)
                        // show login menu in popup
                        this.actions$.next({'show-authentication': ''})
                        await logout()
                        storage.onChange().pipe(
                            distinctUntilKeyChanged('apiKey'),
                            filter( store => !!store.apiKey ),
                            take(1)
                        ).subscribe( _ => this.actions$.next({}) )
                    },
                    'default': _ => {
                    }
                };
                (errorMap[error] || errorMap['default'])()
            })
        downloadItem = {
            ...downloadItem,
            downloadItemSubscription
        }
        this.addActiveDownload(downloadItem)

    }
    addActiveDownload(downloadItem) {
        this.activeDownloads = [
            ...this.activeDownloads,
            downloadItem
        ]
        this.activeDownload$.next( this.activeDownloads.map(this.sanitizeItem) )
    }
    removeAciveDownload({id: downloadId}) {
        const downloadItem = this.activeDownloads.find( x => x.id === downloadId )
        if (downloadItem && downloadItem.downloadItemSubscription)
            downloadItem.downloadItemSubscription.unsubscribe()
        this.activeDownloads = this.activeDownloads.filter( x => x.id !== downloadId )
        this.activeDownload$.next( this.activeDownloads.map(this.sanitizeItem) )
    }
    updateStatus(downloadItem) {
        const {id, status, progress, error, filename} = downloadItem
        if (progress) {
            const { loaded, total, rate } = progress
            const percent = loaded && total && Math.round(100 * (loaded / total))
            // console.log(`item: ${id} statue: ${status} progress: ${percent} rate: ${rate}`)
        } else {
            console.log(`item: ${id} statue: ${status}`)
        }
        const item = this.activeDownloads.find( i => i.id === id)
        if (item) {
            item.status = status
            item.progress = progress
            item.error = error
            item.filename = filename
        }
    }
    sanitizeItem(item) {
        const { downloadItemSubscription, ...rest } = item
        return rest
    }

    showDialog(download_id){
        this.catchedDownloads[download_id].dialogShown = true;
        let dialog_url = browser.runtime.getURL("dialog/dialog.html") + "?download_id=" + download_id + "&filename=" + this.catchedDownloads[download_id].filename;
        chrome.tabs.sendMessage(this.catchedDownloads[download_id].targetTab, { target: "dialog", dialog_url: dialog_url, action: "show", dialog_id: download_id });
    };

    hideDialog(dialog_id){
        chrome.tabs.query({}, function (tabs) {
            tabs.forEach(function (tab) {
                chrome.tabs.sendMessage(tab.id, {target: "dialog", action: "hide", dialog_id: dialog_id });
            })
        });
    }

}
export let downloader = new Downloader();