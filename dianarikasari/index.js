'use strict';

const libingester = require('libingester');
const url = require('url');

const CATEGORY_LINKS = [
    'http://dianarikasari.blogspot.com/search/label/%2388lovelife?max-results=', //love life
    'http://dianarikasari.blogspot.com/search/label/Fashion%20Diary?max-results=', //fashion diary
    'http://dianarikasari.blogspot.com/search/label/Bidi%20Bidi%20Bong%20Bong?max-results=', //bidi bidi bong
    'http://dianarikasari.blogspot.com/search/label/My%20Personal%20Life?max-results=', //my personal life
    'http://dianarikasari.blogspot.com/search/label/Thoughts?max-results=', //thoughts
    'http://dianarikasari.blogspot.com/search/label/%23DianaRikasariYoutube?max-results=', //Diana Rikasari Youtube
];

// max number of links per category
const MAX_LINKS = 10;

// remove elements (body)
const REMOVE_ELEMENTS = [
    'iframe',
    'noscript',
    'script',
    'style',
];

// clean attr (tag)
const REMOVE_ATTR = [
    'border',
    'class',
    'dir',
    'height',
    'id',
    'sizes',
    'src',
    'srcset',
    'style',
    'trbidi',
    'width',
];

// clean attr (tag)
const CLEAN_TAGS = [
    'a',
    'b',
    'br',
    'div',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'i',
    'img',
    'span',
    'table',
];

const CUSTOM_SCSS = `
$primary-light-color: #5e7790;
$primary-medium-color: #2d3e4e;
$primary-dark-color: #1b242e;
$accent-light-color: #F00EA5;
$accent-dark-color: #C70A62;
$background-light-color: #F0F4F7;
$background-dark-color: #DADFE3;

$title-font: 'Oswald';
$body-font: 'Raleway';
$display-font: 'Oswald';
$logo-font: 'Oswald';
$context-font: 'Oswald';
$support-font: 'Raleway';

@import '_default';
`;

/** delete duplicated elements in array **/
Array.prototype.unique=function(a){
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

/**
 * ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The string url
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const _body = $('.post-body div'); // messy body
        const body = $('<div id="mybody"></div>');
        const date_published = new Date(Date.parse($('.date-header span').text()));
        const title = $('.post-title').text().replace(/\n/g,'');

        // Ingest video post
        const iframe = $('.post-body iframe, .post-body script').first()[0];
        if (iframe) {
            const video_url = $(iframe).attr('src') || '';
            if (video_url.includes('youtube')) {
                const video_asset = new libingester.VideoAsset();
                const thumb_url = $('meta[property=\'og:image\']').attr('content');
                const full_uri = url.format(video_url, { search: false })
                // thumbnail
                const thumbnail = libingester.util.download_image(thumb_url);
                thumbnail.set_title(title);
                hatch.save_asset(thumbnail);
                // save video
                video_asset.set_canonical_uri(full_uri);
                video_asset.set_last_modified_date(date_published);
                video_asset.set_title(title);
                video_asset.set_download_uri(full_uri);
                hatch.save_asset(video_asset);
            }
            return;
        }

        // Ingest Blog Post
        const asset = new libingester.BlogArticle();
        const author = $('.post-author a span').first().text();
        const tags = $('.post-labels a').map((i,elem) => $(elem).text()).get();
        const synopsis = $('meta[property=\'og:description\']').attr('content');
        const read_more = 'Read more at www.dianarikasari.blogspot.com';

        // creating new body
        let last_p;
        _body.contents().map((i,elem) => {
            if (elem.name == 'br') {
                last_p = undefined;
                $(elem).remove();
            } else if (elem.name == 'div') {
                body.append($(elem));
                last_p = undefined;
            } else if (elem.name == 'img') {
                body.append($('<figure></figure>').append(elem));
                last_p = undefined;
            } else {
                if (!last_p) {
                    body.append($('<p></p>'));
                    last_p = body.find('p').last();
                    last_p.append($(elem));
                } else {
                    last_p.append($(elem));
                }
            }
        });

        // download images
        let thumbnail;
        body.find('img').map((i,elem) => {
            if (elem.attribs.src) {
                const image = libingester.util.download_img($(elem));
                image.set_title(title);
                hatch.save_asset(image);
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            } else {
                $(elem).remove();
            }
        });

        // remove elements and comments
        body.contents().filter((index, node) => node.type === 'comment').remove();
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find(CLEAN_TAGS.join(',')).get().map((tag) => clean_attr(tag));
        body.find('p,div').filter((i,elem) => $(elem).text().trim() === '').remove();

        // save document
        console.log('processing',title);
        asset.set_author(author);
        asset.set_body(body);
        asset.set_custom_scss(CUSTOM_SCSS);
        asset.set_canonical_uri(uri);
        asset.set_date_published(date_published);
        asset.set_last_modified_date(date_published);
        asset.set_read_more_text(read_more);
        asset.set_synopsis(synopsis);
        asset.set_tags(tags);
        asset.set_title(title);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if (err.code == 'ECONNRESET') return ingest_article(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch('dianarikasari', 'en');

    const get_all_links = () => {
        let all_links = [];
        return Promise.all(
            CATEGORY_LINKS.map(link => libingester.util.fetch_html(link + MAX_LINKS).then($ => {
                const links = $('.post-title a').map((i,elem) => elem.attribs.href).get();
                all_links = all_links.concat(links);
            })
        )).then(() => all_links.unique());
    }

    get_all_links().then(links => {
        return Promise.all(links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
