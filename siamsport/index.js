'use strict';

const libingester = require('libingester');
const moment = require('moment');
//const mustache = require('mustache');
//const template = require('./template');
const url = require('url');

const base_uri = 'http://www.siamsport.co.th/';
const uri_article = 'http://www.siamsport.co.th/More_News.asp';
const uri_gallery = 'http://www.siamsport.co.th/SiamsportPhoto/index.php';
const uri_video = 'http://sstv.siamsport.co.th/top_hits.php';

// clean images
const REMOVE_ATTR = [
    'class',
    'style'
];

// Remove elements (meta.body)
const REMOVE_ELEMENTS = [
    'br',
    'iframe',
    'script',
    'style',
    '#ssinread'
];

// copyright warning
const REMOVE_COPYRIGHT = [
    'Getty Images',
    'mirror.com',
    'Siamsport',
    '"บอ.บู๋"'
];

// embed video
const VIDEO_IFRAMES = [
    'sstv.siamsport.co.th'
];

/** get articles metadata **/
function _get_ingest_settings($) {
    const canonical_uri = $('meta[property="og:url"]').attr('content');
    const d = $(`.titlenews .black13, .newsde-title .black11,
                 .toptitle2 .black13t, .date-time, .font-gray`).text();
    const date = new Date(Date.parse(moment(d,'DD-MM-YYYY hh:mm').format()));
    const desc = $(`meta[property="og:description"], meta[name="description"],
                    meta[name="Description"]`).attr('content') || '';
    const title = $('meta[property="og:title"]').attr('content') ||
                  $('title').text();
    const section = canonical_uri.replace('http://www.siamsport.co.th/','');
    return {
        author: 'siamsport.co.th', // no authors
        body: $('.newsdetail, .txtdetails, .newsde-text').first(), // all
        canonical_uri: canonical_uri,
        date_published: Date.now(date),
        modified_date: date,
        // custom_scss: CUSTOM_SCSS,
        read_more: `Bài gốc ở <a href="${canonical_uri}">siamsport</a>`,
        section: section.substring(0,section.indexOf('/')), // no section
        synopsis: desc.replace(/[\t\n]/g, ''),
        source: 'siamsport',
        title: title.replace(/[\t\n]/g, ''),
    }
}

/** set articles metadata **/
function _set_ingest_settings(asset, meta) {
    if (meta.author) asset.set_authors(meta.author);
    if (meta.body) asset.set_body(meta.body);
    if (meta.canonical_uri) asset.set_canonical_uri(meta.canonical_uri);
    if (meta.custom_scss) asset.set_custom_scss(meta.custom_scss);
    if (meta.date_published) asset.set_date_published(meta.date_published);
    if (meta.modified_date) asset.set_last_modified_date(meta.modified_date);
    if (meta.lede) asset.set_lede(meta.lede);
    if (meta.read_more) asset.set_read_more_link(meta.read_more);
    if (meta.section) asset.set_section(meta.section);
    if (meta.source) asset.set_source(meta.source);
    if (meta.synopsis) asset.set_synopsis(meta.synopsis);
    if (meta.title) asset.set_title(meta.title);
}

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const uri_main_image = $('meta[property="og:image"]').attr('content');
        console.log('processing: '+uri);


        if ($('.newsdetail, .txtdetails, .newsde-text').length<1) throw {code: -1, message: 'Empty body'};

        let meta = _get_ingest_settings($);
        if (!meta.title) throw {code: -1, message: 'File not Found!'}; // Some links return "File Not Found !"

        console.log(meta.modified_date);
        // set first paragraph
        const divs = meta.body.contents().filter((i,elem) => {
            if (elem.attribs) return elem.attribs.style;
        }).get();

        if (divs.length == 2) {
            meta['body'] = $(divs[1]);
            meta['lede'] = $(`<p>${$(divs[0]).text()}</p>`);
        }

        if (!meta.lede) {
            const first_p = meta.body.find('strong').first();
            meta['lede'] = $(`<p>${first_p.text()}</p>`);
            meta.body.find(first_p).remove();
        }

        // main image
        const main_image = libingester.util.download_image(uri_main_image);
        main_image.set_title(meta.title);
        asset.set_thumbnail(main_image);
        asset.set_main_image(main_image, '');
        hatch.save_asset(main_image);

        // remove elements and comments
        const clen_attr = (elem) => REMOVE_ATTR.forEach(attr => $(elem).removeAttr(attr));
        meta.body.contents().filter((i, elem) => elem.type === 'comment').remove();
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();

        // clean attribs (meta.body)
        meta.body.find('span').removeAttr('style');

        // remove copyright warning
        const warning = meta.body.find('strong').last();
        for (const w of REMOVE_COPYRIGHT) {
            if (warning.text() == w) {
                $(warning).parent().parent().remove();
                break;
            }
        }

        // download images
        meta.body.find('img').get().map((img) => {
            const parent = $(img).parent();
            const figure = $(`<figure><img src="${img.attribs.src}" /></figure>`);
            const image = libingester.util.download_img($(figure.children()[0]));
            image.set_title(meta.title);
            $(img).remove();
            if (parent[0].name == 'p') {
                figure.insertAfter(parent);
            }
            hatch.save_asset(image);
        });

        const tags = meta.body.find('p,span');
        tags.map((i,elem) => clen_attr(elem));
        tags.filter((i, elem) => $(elem).text().trim() === '').remove();

        //asset.set_custom_scss(CUSTOM_CSS);
        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        console.log('Ingest article error: ', err);
        if (err.code==-1) { return ingest_article(hatch, uri); }
    });
}
//
// function ingest_gallery(hatch, uri) {
//     return libingester.util.fetch_html(uri).then(($) => {
//         const asset = new libingester.NewsArticle();
//         const title = $('.font-pink18').first().text();
//
//         // Article Settings
//         asset.set_canonical_uri(uri);
//         asset.set_section('Gallery');
//         asset.set_title(title);
//
//         // set last modified Date
//         let data = $('.font-pink11').first().parent().text();
//         const regex = /[\s\S]*(\d{2,}\/\d+)\/(\d{2})[\s\S]*(\d{2,}:\d{2,})[\s\S]*/;
//         const date = data.replace(regex, "$1/20$2 $3:00");
//         asset.set_last_modified_date(get_last_modified_date(date));
//
//         // get all image links
//         let image_links = $('a[rel="exgroup"]').get().map((a) => {
//             return url.resolve(uri_gallery, a.attribs.href);
//         });
//         image_links.shift(); //remove repeat link
//
//         // download images
//             let images = [];
//             for (const src of image_links) {
//                 const image = libingester.util.download_image(src);
//
//                 image.set_title(title);
//                 hatch.save_asset(image);
//                 images.push({ image: image });
//             }
//             asset.set_thumbnail(images[images.length - 1].image);
//
//
//         // asset.set_custom_scss(CUSTOM_CSS);
//         // asset.render();
//         // hatch.save_asset(asset);
//
//         render_template(hatch, asset, {
//             gallery: images,
//             published: date,
//             title: title,
//         });
//     }).catch((err) => {
//         console.log('Ingest gallery error: '+err);
//         return ingest_gallery(hatch, uri);
//     });
// }

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const description = get_description($);
        const keywords = get_keywords($);
        const modified_time = get_date($);
        const thumb_url = $('meta[property="og:image"]').attr('content');
        const title = get_title($);
        const video_url = $('.embed-container').find('iframe').attr('src') || '';

        for (const domain of VIDEO_IFRAMES) {
            if (video_url.includes(domain)) {
                const thumbnail = libingester.util.download_image(thumb_url);
                thumbnail.set_title(title);
                hatch.save_asset(thumbnail);

                const video = new libingester.VideoAsset();
                video.set_canonical_uri(uri);
                video.set_download_uri(video_url);
                video.set_last_modified_date(get_last_modified_date(modified_time));
                video.set_synopsis(description);
                video.set_thumbnail(thumbnail);
                video.set_title(title);
                hatch.save_asset(video);
            }
        }
    }).catch((err) => {
        console.log('Ingest video error: '+err);
        return ingest_video(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch('siamsport', 'th');

    // ingest_article(hatch, 'http://www.siamsport.co.th/Sport_Football/170620_305.html')
    //     .then(() => hatch.finish());
    const article = libingester.util.fetch_html(uri_article).then(($) =>
        Promise.all(
            $('tr[valign="top"] td a').get().map((a) => {
                return libingester.util.fetch_html(a.attribs.href).then(($) => {
                    const u = $('META').attr('content'),
                        link = u.substring(u.indexOf('http'));
                    const uri = link.includes('siamsport.co.th') ? link : a.attribs.href;
                    return ingest_article(hatch, uri);
                })
            })
        )
    );

    // const gallery = libingester.util.fetch_html(uri_gallery).then(($) => {
    //     const links = $('.pink18-link').get().map((a) => url.resolve(uri_gallery, a.attribs.href));
    //     return Promise.all(links.map((uri) => ingest_gallery(hatch, uri)));
    // });

    // const video = libingester.util.fetch_html(uri_video).then(($) => {
    //     const links = $('.top-pic a').get().map((a) => url.resolve(uri_video, a.attribs.href));
    //     return Promise.all(links.map((uri) => ingest_video(hatch, uri)));
    // });
    //
    // // Promise.all([article, gallery, video]).then(() => {
    Promise.all([article])
        .then(() => hatch.finish());
}

main();
