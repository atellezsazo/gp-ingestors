'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'https://learningenglish.voanews.com/';
const PAGE_LINKS = 'https://learningenglish.voanews.com/z/4729';

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.VideoAsset();
        const description = $('meta[property="og:description"]').attr('content');
        const download_uri = $('video[data-type="video/mp4"]').attr('src');
        const modified_date = $('span.date time').attr('datetime');
        const title = $('meta[property="og:title"]').attr('content');
        const uri_thumb = $('meta[property="og:image"]').attr('content');

        // download thumbnail
        const thumb = libingester.util.download_image(uri_thumb);
        thumb.set_title(title);

        // video settings
        asset.set_canonical_uri(uri);
        asset.set_download_uri(download_uri);
        asset.set_last_modified_date(new Date(Date.parse(modified_date)));
        asset.set_synopsis(description);
        asset.set_thumbnail(thumb);
        asset.set_title(title);

        //save assets
        hatch.save_asset(thumb);
        hatch.save_asset(asset);
    });
}

function main() {
    const hatch = new libingester.Hatch('learning-english-voa', 'en');

    libingester.util.fetch_html(PAGE_LINKS).then($ => {
        const links = $('#content').find('.img-wrap').get().map(a => url.resolve(BASE_URI, a.attribs.href));
        return Promise.all(links.map(uri => ingest_video(hatch, uri)))
            .then(() => hatch.finish());
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
