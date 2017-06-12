'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require('bluebird');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const url = require('url');

const base_uri = 'https://beritagar.id/';
const page_gallery = 'https://beritagar.id/spesial/foto/';
const page_video = 'https://beritagar.id/spesial/video/';
const FEED_RSS = 'https://beritagar.id/rss/';

// clean images
const remove_attr_img = [
    'class',
    'data-src',
    'src',
    'style'
];

// Remove elements (body)
const REMOVE_ELEMENTS = [
    '.article-recomended',
    '.article-sharer',
    '.article-sub-title',
    '.follow-bar',
    '.gallery-list',
    '.gallery-navigation',
    '.gallery-single',
    '.twitter-tweet',
    '.unread',
    '#commentFBDesktop',
    '#load-more-btn',
    '#opinibam',
    '#semar-placement',
    '#semar-placement-v2',
    'iframe',
    'script'
];

const REMOVE_ELEMENTS_HEADER = [
    '.sponsored-socmed',
    'iframe',
    'script'
];

const CUSTOM_SCSS = `
/*Global Colors & Fonts */
$primary-light-color: #E50921;
$primary-medium-color: #001D53;
$primary-dark-color: #00112F;
$accent-light-color: #1F96E5;
$accent-dark-color: #0071BC;
$background-light-color: #F5F5F5;
$background-dark-color: #E9E9E9;
/*extra color: #0063C6*/
$title-font: ‘Montserrat’;
$display-font: ‘Dosis’;
$context-font: ‘Dosis’;
$support-font: ‘Dosis’;

/* Import News Template */
@import '_default';

/* Class Overrrides */

.ArrangementSideBySide .CardTitle__title {
		font-family: $context-font;
		font-weight: 500;
}

.ArrangementSideBySide .CardTitle .FormattableLabel {
	-EknFormattableLabel-text-transform:'uppercase';
	font-weight: 500;
}

.BannerSet .FormattableLabel {
	-EknFormattableLabel-text-transform:'uppercase';
	font-weight: 500;
}

.ArrangementList .ContentGroupContentGroup__title{
	-EknFormattableLabel-text-transform:'uppercase';
	font-weight: 500;
}

.ArrangementThirties .CardDefaultFamily .FormattableLabel {
	-EknFormattableLabel-text-transform:'uppercase';
	font-weight: 500;
}

.ArrangementThirties .Card__context .FormattableLabel {
	-EknFormattableLabel-text-transform:'uppercase';
	font-weight: 500;
}

.ArrangementSquareGuys .Card__context .FormattableLabel{
	-EknFormattableLabel-text-transform:'uppercase';
	font-weight: 500;
}
.Card__context .FormattableLabel {
	-EknFormattableLabel-text-transform:'uppercase';
	font-weight: 500;
}

.ArrangementThirties .CardDefaultFamily__context{
	display:block;
	background:$primary-light-color;
	padding:5px 15px 5px 20px;
	border-radius:0 20px 20px 0;
	color:white;
	font-family:'Dosis';
	margin-top:10px;
	margin-left:-20px;
}

.ArrangementSquareGuys .Card__context{
	display:block;
	background:$primary-light-color;
	padding:5px 15px 5px 20px;
	border-radius:0 20px 20px 0;
	color:white;
	font-family:'Dosis';
	margin-top:10px;
	margin-left:-20px;
}

.ArrangementSquareGuys .CardThumb{
	padding-bottom:20px;
}
.ArrangementSquareGuys .CardThumb__thumbnail{
	margin-bottom:10px;
}

/* crazy workaround to make the Dynamic BG colored*/

.set-page .LayoutDynamicBackground{
	background-color: #0063C6;
	background-image: linear-gradient($background-light-color);
}

.home-page .LayoutDynamicBackground{
	background-color: $background-light-color;
}
`;

// download images
const download_image = (hatch, that, title) => {
    if (that.attribs.src) {
        const image = libingester.util.download_image(that.attribs.src);
        image.set_title(title);
        that.attribs["data-libingester-asset-id"] = image.asset_id;
        for (const attr of remove_attr_img) {
            delete that.attribs[attr];
        }
        hatch.save_asset(image);
        return image;
    }
}

// get articles metadata
function _get_ingest_settings($) {
    return {
        author: $('meta[name="author"]').attr('content'),
        body: $('section.article-content').first(),
        canonical_uri: $('link[rel="canonical"]').attr('href'),
        copyright: $('meta[name="copyright"]').attr('content'),
        custom_scss: CUSTOM_SCSS,
        date_published: Date.now(Date.parse($('meta[property="article:modified_time"]').attr('content'))),
        modified_date: new Date(Date.parse($('meta[property="article:modified_time"]').attr('content'))),
        section: $('meta[property="article:section"]').attr('content'),
        synopsis: $('meta[property="og:description"]').attr('content'),
        source: 'beritagar.id',
        read_more: `Baca lebih lanjut tentang <a href="${$('link[rel="canonical"]').attr('href')}">beritagar.id</a>`,
        title: $('meta[name="title"]').attr('content'),
        uri_main_image: $('meta[property="og:image"]').attr('content'),
    }
}

// set articles metadata
function _set_ingest_settings(asset, meta) {
    if(meta.author) asset.set_authors(meta.author);
    if(meta.body) asset.set_body(meta.body);
    if(meta.canonical_uri) asset.set_canonical_uri(meta.canonical_uri);
    if(meta.custom_scss) asset.set_custom_scss(meta.custom_scss);
    if(meta.date_published) asset.set_date_published(meta.date_published);
    if(meta.modified_date) asset.set_last_modified_date(meta.modified_date);
    if(meta.lede) asset.set_lede(meta.lede);
    if(meta.read_more) asset.set_read_more_link(meta.read_more);
    if(meta.section) asset.set_section(meta.section);
    if(meta.source) asset.set_source(meta.source);
    if(meta.synopsis) asset.set_synopsis(meta.synopsis);
    if(meta.title) asset.set_title(meta.title);
}

// post data
const get_post_data = (hatch, asset, $, uri) => {
    const section = $('meta[property="article:section"]').attr('content');
    const title = $('meta[property="og:title"]').attr('content');
    const synopsis = $('meta[property="og:description"]').attr('content');

    asset.set_canonical_uri(uri);
    asset.set_section(section);
    asset.set_title(title);
    asset.set_synopsis(synopsis);

    const modified_time = $('meta[property="article:modified_time"]').attr('content');
    let date = new Date(Date.parse(modified_time));
    if (!date) date = new Date();
    asset.set_last_modified_date(date);

    const $article_info = $('.article-info');
    $article_info.find('a').removeAttr('style');

    const author = $article_info.find('address').first(); // author post
    const published = $article_info.find('time').first(); // published data
    for (const element of REMOVE_ELEMENTS_HEADER) {
        author.find(element).remove();
    }

    // download image (author avatar)
    author.find('img').map(function() {
        download_image(hatch, this, title);
    });

    // article tags
    let article_header = $('.article-header .breadcrumb').first();
    if (article_header.length > 0) {
        article_header.removeAttr('class');
    } else {
        article_header = $('#main .media-channel').first();
        article_header.find('a').map(function() {
            this.attribs.href = url.resolve(base_uri, this.attribs.href);
        });
        article_header = article_header.html();
    }

    return {
        author: author.html(),
        category: article_header,
        date: date,
        published: published.html(),
        title: title,
        uri: uri
    };
}

// body post
const get_body = (hatch, asset, $, post_data) => {
    const body = $('section.article-content').first();
    const thumb_url = $('meta[property="og:image"]').attr('content');
    const thumb = libingester.util.download_image(thumb_url);

    // article thumbnail
    thumb.set_title(post_data.title);
    hatch.save_asset(thumb);
    asset.set_thumbnail(thumb);

    // remove body tags and comments
    for (const element of REMOVE_ELEMENTS) {
        body.find(element).remove();
    }
    body.contents().filter((index, node) => node.type === 'comment').remove();

    // download images
    body.find('img').map(function() {
        download_image(hatch, this, post_data.title);
    });

    return body;
}

function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.url).then($ => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);

        // first paragraph (set_lede)
        const first_p = $('.article-sub-title').first()[0] || meta.body.find('p').first()[0];
        const lede = $(first_p).clone();
        lede.find('img').remove();
        meta.body.find(first_p).remove();
        meta['lede'] = lede;

        // download background image (sometimes)
        let bg_img, thumbnail;
        const article_bg = $('.article-background-image').first();
        if (article_bg.length != 0) {
            const bg = article_bg[0].attribs.style; //get url
            const bg_img_uri = bg.substring(bg.indexOf('http'), bg.indexOf('jpg') + 3);
            bg_img = libingester.util.download_image(bg_img_uri);
            bg_img.set_title(post_data.title);
            hatch.save_asset(bg_img);
            if(!thumbnail) asset.set_thumbnail(thumbnail = bg_img);
        }

        // download post images
        meta.body.find('img').map((i, elem) => {
            if (elem.attribs.src) {
                const image = libingester.util.download_img($(elem));
                image.set_title(meta.title);
                hatch.save_asset(image);
                if(!thumbnail) asset.set_thumbnail(thumbnail = image);
            }
        });

        // download instagram images
        const instagram_promises = meta.body.find('blockquote.instagram-media').map(function() {
            const href = $(this).find('a').first()[0].attribs.href;
            if (href) {
                return libingester.util.fetch_html(href).then(($inst) => { // It is necessary to wait
                    const image_uri = $inst('meta[property="og:image"]').attr('content');
                    const image_description = $inst('meta[property="og:description"]').attr('content');
                    const image_title = $inst('meta[property="og:title"]').attr('content') || post_data.title;
                    const image = libingester.util.download_image(image_uri);
                    image.set_title(image_title);
                    hatch.save_asset(image);

                    // replace tag 'blockquote' by tag 'figure'
                    const figcaption = $inst(`<figcaption>${image_description}</figcaption>`);
                    const figure = $inst(`<figure></figure>`);
                    const img = $inst(`<img data-libingester-asset-id=${image.asset_id} >`);
                    $(figure).append(img, figcaption);
                    $(this).replaceWith(figure);
                });
            }
        }).get();

        return Promise.all(instagram_promises).then(() => {
            _set_ingest_settings(asset, meta);
            asset.render();
            hatch.save_asset(asset);
        });
    })
}

// function ingest_article(hatch, uri) {
//     return new Promise((resolve, reject) => {
//         if (uri.includes('/media/')) { // avoid repeated links
//             resolve();
//             return;
//         }
//         libingester.util.fetch_html(uri).then(($) => {
//             const asset = new libingester.NewsArticle();
//             let post_data = get_post_data(hatch, asset, $, uri);
//
//             const article_subtitle = $('.article-sub-title').first();
//             const body = get_body(hatch, asset, $, post_data);
//
//             // download background image
//             let bg_img;
//             const article_bg = $('.article-background-image').first();
//             if (article_bg.length != 0) {
//                 const bg = article_bg[0].attribs.style; //get url
//                 const bg_img_uri = bg.substring(bg.indexOf('http'), bg.indexOf('jpg') + 3);
//                 bg_img = libingester.util.download_image(bg_img_uri);
//                 bg_img.set_title(post_data.title);
//                 hatch.save_asset(bg_img);
//             }
//
//             // download instagram images
//             const instagram_promises = body.find('blockquote.instagram-media').map(function() {
//                 const href = $(this).find('a').first()[0].attribs.href;
//                 if (href) {
//                     return libingester.util.fetch_html(href).then(($inst) => { // It is necessary to wait
//                         const image_uri = $inst('meta[property="og:image"]').attr('content');
//                         const image_description = $inst('meta[property="og:description"]').attr('content');
//                         const image_title = $inst('meta[property="og:title"]').attr('content') || post_data.title;
//                         const image = libingester.util.download_image(image_uri);
//                         image.set_title(image_title);
//                         hatch.save_asset(image);
//
//                         // replace tag 'blockquote' by tag 'figure'
//                         const figcaption = $inst(`<figcaption>${image_description}</figcaption>`);
//                         const figure = $inst(`<figure></figure>`);
//                         const img = $inst(`<img data-libingester-asset-id=${image.asset_id} >`);
//                         $(figure).append(img, figcaption);
//                         $(this).replaceWith(figure);
//                     });
//                 }
//             }).get();
//
//             Promise.all(instagram_promises).then(() => {
//                 post_data['article_subtitle'] = article_subtitle;
//                 post_data['bg_img'] = bg_img;
//                 post_data['body'] = body.html();
//                 render_template(hatch, asset, template.structure_template, post_data);
//                 resolve();
//             });
//         })
//     });
// }

function ingest_gallery(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        let post_data = get_post_data(hatch, asset, $, uri);

        const media_subtitle = $('.media-sub-title').first();
        const body = get_body(hatch, asset, $, post_data);

        post_data['article_subtitle'] = media_subtitle;
        post_data['body'] = body.html();

        render_template(hatch, asset, template.structure_template, post_data);
    })
}

function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const article_tags = $('#main .media-channel').first();
        const copyright = $('meta[name="copyright"]').attr('content');
        const description = $('meta[property="og:description"]').attr('content');
        const modified_time = $('meta[property="article:modified_time"]').attr('content');
        const date = new Date(Date.parse(modified_time));
        const title = $('meta[name="title"]').attr('content');

        // download background video (thumbnail)
        let bg_img_video;
        const bg_img_video_uri = $('meta[property="og:image"]').attr('content');
        bg_img_video = libingester.util.download_image(bg_img_video_uri);
        bg_img_video.set_title(title);
        hatch.save_asset(bg_img_video);

        // save video asset
        const video_uri = $('.video-player iframe').first().attr('src');
        if (video_uri) {
            const video = new libingester.VideoAsset();
            video.set_canonical_uri(uri);
            video.set_download_uri(video_uri);
            video.set_last_modified_date(date);
            video.set_license(copyright);
            video.set_thumbnail(bg_img_video);
            video.set_title(title);
            video.set_synopsis(description);
            hatch.save_asset(video);
        }
    })
}

function main() {
    const hatch = new libingester.Hatch();
    // const item = { title: 'Hamilton butuh upaya keras untuk hentikan Vettel di Kanada',
    //     description: 'Mobil Ferrari yang dikendalikan Sebastian Vettel adalah mobil paling konsisten di musim F1 2017.',
    //     link: 'http://beritagar.id/artikel/arena/hamilton-butuh-upaya-keras-untuk-hentikan-vettel-di-kanada',
    //     url: 'http://beritagar.id/artikel/arena/hamilton-butuh-upaya-keras-untuk-hentikan-vettel-di-kanada',
    //     created: 1497012417000
    // };
    //
    // ingest_article(hatch, item).then(() => hatch.finish());
    // const ingest = (page_uri, resolved, concurrency = Infinity) => {
    //     if (page_uri.includes('rss')) {
    //         rss2json.load(FEED_RSS, function(err, rss) {
    //             Promise.map(rss.items, function(item) {
    //                 return ingest_article(hatch, item.url); // post article
    //             }, { concurrency: concurrency }).then(() => resolved());
    //         });
    //     } else {
    //         libingester.util.fetch_html(page_uri).then(($) => {
    //             const tags = $('#main .swifts .content a.title').get(); // more recent media links
    //             Promise.map(tags, (tag) => {
    //                 if (page_uri.includes('foto')) { // media gallery
    //                     return ingest_gallery(hatch, url.resolve(base_uri, tag.attribs.href));
    //                 } else if (page_uri.includes('video')) { // media video
    //                     return ingest_video(hatch, url.resolve(base_uri, tag.attribs.href));
    //                 }
    //             }, { concurrency: concurrency }).then(() => resolved());
    //         });
    //     }
    // }

    const article = new Promise((resolve, reject) => {
        rss2json.load(FEED_RSS, (err, rss) => {
            Promise.all(rss.items.map(item => ingest_article(hatch, item)))
                .then(() => resolve())
        })
    });

    // const article = new Promise((resolve, reject) => ingest(FEED_RSS, resolve));
    // const gallery = new Promise((resolve, reject) => ingest(page_gallery, resolve));
    // const video = new Promise((resolve, reject) => ingest(page_video, resolve));

    Promise.all([article]).then(() => {
        return hatch.finish();
    });
}

main();
