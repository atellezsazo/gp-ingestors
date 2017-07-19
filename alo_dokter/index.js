'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://www.alodokter.com';

const CATEGORY_LINKS = [
    'http://www.alodokter.com/hidup-sehat', //Healthy Living
    'http://www.alodokter.com/keluarga', //Family
    'http://www.alodokter.com/kesehatan' //Health
];

/** delete duplicated elements in array **/
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

// max number of links per category
const MAX_LINKS = 10;

const CUSTOM_CSS = `
$primary-light-color: #E50200;
$primary-medium-color: #262626;
$primary-dark-color: #000000;
$accent-light-color: #E50200;
$accent-dark-color: #C90200;
$background-light-color: #F4F4F4;
$background-dark-color: #CCCCCC;
$title-font: 'Roboto';
$body-font: 'Merriweather';
$display-font: 'Titillium Web';
$context-font: 'Titillium Web';
$support-font: 'Roboto';
@import "_default";
`;

const CLEAN_TAGS = [
    'p',
    'span',
    'div'
];

// clean images
const REMOVE_ATTR = [
    'class',
    'data-src',
    'data-te-category',
    'data-te-label',
    'data-te-tracked',
    'style',
];

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'div',
    'link',
    'noscript',
    'script',
    'style',
    '.share-button',
];


function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.NewsArticle();
        const author = $('meta[name="bt:author"]').attr('content') || 'Alodokter';
        const section = $('meta[property="article:section"]').attr('content');
        let body = $('.entry-content body');
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const info_date = $('meta[property="og:updated_time"]').attr('content');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const page = 'Alodokter';
        const read_more = `Bài báo gốc tại <a href="${canonical_uri}">${page}</a>`;
        const synopsis = $('meta[name="description"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        let thumbnail;

        // remove elements
        body.contents().filter((index, node) => node.type === 'comment').remove();
        const clean_attr = (elem) => REMOVE_ATTR.forEach(attr => $(elem).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // set first paragraph
        const first_p = body.find('p').first();
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);
        body.find(first_p).remove();

        // download images
        body.find('img').map(function() {
            let img = $('<figure></figure>').append($(this).clone());
            let figcaption = $(this).attr('alt') || {};
            img.append($(`<figcaption><p>${figcaption}</p></figcaption>`));
            $(figcaption).remove();
            const image = libingester.util.download_img($(img.children()[0]));
            if (!thumbnail) {
                asset.set_thumbnail(thumbnail=image);
            }
            $(this).replaceWith(img);
            image.set_title(title);
            hatch.save_asset(image);
       });


        // clean tags
        body.find(CLEAN_TAGS.join(',')).map((i,elem) => clean_attr(elem));

        const end_tag = ['p', 'h3', 'ul', 'h2'];
        const is_end_tag = (tag) => {
            for (const tag_name of end_tag) {
                if (tag_name == tag.name) return true;
            }
            return false;
        }

        //We introduce in labels p the text that is directly in the body
        let new_p = $('<p></p>');
        body.contents().map((i,elem) => {
            if (is_end_tag(elem) && new_p.text().trim() != '') {
                new_p.clone().insertBefore(elem);
                new_p = $('<p></p>');
            } else if (!is_end_tag(elem)) {
                new_p.append($(elem).clone());
                $(elem).remove();
            }
        });

        // Article Settings
        console.log('processing: ', title);
        asset.set_authors([author]);
        asset.set_canonical_uri(canonical_uri);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.set_date_published(modified_date);
        asset.set_last_modified_date(modified_date);
        asset.set_read_more_link(read_more);
        asset.set_section(section);
        asset.set_source(page);
        asset.set_synopsis(synopsis);
        asset.set_title(title);
        asset.set_body(body);

        asset.render();
        hatch.save_asset(asset);

   }).catch((err) => {
       console.log('Ingest article error: ', err);
       if (err.code==-1) { return ingest_article(hatch, uri); }
   });
}

// function ingest_video (hatch, uri){
//     return libingester.util.fetch_html(uri).then($ => {
//
//         const asset = new libingester.VideoAsset();
//
//         if (!$('script[type="application/ld+json"]').text()) { // Error 404
//             return;
//         }
//         // Catch info video
//         const video_json = JSON.parse($('script[type="application/ld+json"]').text());
//
//         const date = new Date(Date.parse(video_json.uploadDate));
//         const title = video_json.name;
//         const video_uri = video_json.embedUrl;
//         const thumbnail = video_json.thumbnailUrl;
//
//
//         const image = libingester.util.download_image(thumbnail);
//         image.set_title(title);
//         hatch.save_asset(image);
//
//         console.log('processing: ', title);
//         asset.set_last_modified_date(date);
//         asset.set_title(title);
//         asset.set_canonical_uri(uri);
//         asset.set_thumbnail(image)
//         asset.set_download_uri(video_uri);
//         hatch.save_asset(asset);
//
//        }).catch((err) => {
//            console.log('Ingest video error: ', err);
//            if (err.code==-1) { return ingest_video(hatch, uri); }
//        });
// }

// function ingest_gallery(hatch, uri){
//     return libingester.util.fetch_html(uri).then($ => {
//         const asset = new libingester.NewsArticle();
//         const author = $('meta[name="author"]').attr('content');
//         let body = $('#gallery-thumbs');
//         const title = $('meta[name="title"]').attr('content');
//         const canonical_uri = $('link[rel="canonical"]').attr('href');
//         let date = $('meta[name="pub_date"]').attr('content');
//         date=new Date(Date.parse(date));
//         const page = 'Spin';
//         const read_more = `Original article at <a href="${canonical_uri}">${page}</a>`;
//         const section = $(".breadcrumbs a").first().text();
//         const synopsis = $('meta[name="description"]').attr('content');
//         let thumbnail;
//         const uri_main_image = $('meta[property="og:image"]').attr('content');
//
//         if (!body[0]) { // Error 404
//             return;
//         }
//
//         body.find('li').map((i, elem) => {
//             const img = $(elem).find('img').first();
//             const caption = img.attr('title');
//             const image = `<img src="${img.attr('src')}" alt="${img.attr('alt')}">`;
//             const figure = $(`<figure>${image}</figure>`);
//             const figcaption = $(`<figcaption><p>${caption}</p></figcaption>`);
//             const down_img = libingester.util.download_img($(figure.children()[0]));
//             down_img.set_title(title);
//             hatch.save_asset(down_img);
//             $(elem).replaceWith(figure.append(figcaption));
//         });
//
//         // Article Settings
//         console.log('processing', title);
//         asset.set_authors([author]);
//         asset.set_lede(title);
//         asset.set_date_published(date);
//         asset.set_last_modified_date(date);
//         asset.set_read_more_link(read_more);
//         asset.set_section(section);
//         asset.set_source(page);
//         asset.set_synopsis(synopsis);
//         asset.set_title(title);
//         asset.set_body(body);
//         asset.set_canonical_uri(uri);
//         asset.set_title(title);
//         asset.set_custom_scss(CUSTOM_CSS);
//         asset.render();
//         hatch.save_asset(asset);
//
//        }).catch((err) => {
//            console.log('Ingest article error: ', err);
//            if (err.code==-1) { return ingest_gallery(hatch, uri); }
//        });
// }

function _fetch_all_links(links, max) {
    let all_links = []; // all links retrieved from all categories
    return Promise.all(links.map(link => libingester.util.fetch_html(link).then($ => {
        const links = $('.alodokter-thumbnails a').map((i,a) => url.resolve(BASE_URI, a.attribs.href)).get().slice(0, max);
        all_links = all_links.concat(links);
    }))).then(() => all_links.unique()); // before sending, repeated links are removed
}

function main() {
    const hatch = new libingester.Hatch('alo_dokter', 'vi');

    // ingest_article(hatch, 'http://www.alodokter.com/usir-bau-mulut-dengan-rutin-menggunakan-mouthwash')
    //     .then(() => hatch.finish());

    _fetch_all_links(CATEGORY_LINKS, MAX_LINKS).then(links => {

        // console.log(links);
        return Promise.all(links.map(uri => ingest_article(hatch, uri)))
            .then(() => hatch.finish());
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
