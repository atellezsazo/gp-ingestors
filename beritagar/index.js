'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const rss2json = require('rss-to-json');
const url = require('url');

const BASE_URI = 'https://beritagar.id/';
const FEED_RSS = 'https://beritagar.id/rss/';
const PAGE_GALLERY = 'https://beritagar.id/spesial/foto/';
const PAGE_VIDEO = 'https://beritagar.id/spesial/video/';

// clean attributes
const REMOVE_ATTR = [
    'class',
    'data-src',
    'id',
    'style',
];

// Remove elements (body)
const REMOVE_ELEMENTS = [
    'ol[type="1"]',
    '.article-recomended',
    '.article-sharer',
    '.article-sub-title',
    '.fb-quote',
    '.follow-bar',
    '.gallery-list',
    '.gallery-navigation',
    '.gallery-single',
    '.sprite icon-twitter-small',
    '.thumbnail-info',
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

2.ArrangementSquareGuys .Card__context .FormattableLabel{
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

/** get articles metadata **/
function _get_ingest_settings($) {
    return {
        author: $('meta[name="author"]').attr('content') || $('a[rel="author"]').text(),
        body: $('section.article-content').first(),
        canonical_uri: $('link[rel="canonical"]').attr('href'),
        copyright: $('meta[name="copyright"]').attr('content'),
        custom_scss: CUSTOM_SCSS,
        date_published: Date.now($('meta[property="article:modified_time"]').attr('content')),
        modified_date: new Date(Date.parse($('meta[property="article:modified_time"]').attr('content'))),
        section: $('meta[property="article:section"]').attr('content'),
        synopsis: $('meta[name="description"]').attr('content'),
        source: 'beritagar.id',
        read_more: `Baca lebih lanjut tentang <a href="${$('link[rel="canonical"]').attr('href')}">beritagar.id</a>`,
        title: $('meta[name="title"]').attr('content').replace(/\n/g,' '),
        uri_main_image: $('meta[property="og:image"]').attr('content'),
    }
}

/** set articles metadata **/
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

/** download images for body **/
function _download_image($, meta, hatch, asset) {
    let thumbnail;
    const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));
    meta.body.find('img').map((i, elem) => {
        if (elem.attribs.src) {
            clean_attr(elem);
            const image = libingester.util.download_img($(elem));
            image.set_title(meta.title);
            hatch.save_asset(image);
            if(!thumbnail) asset.set_thumbnail(thumbnail = image);
        }
    });
    return thumbnail;
}

/** remove elements and clean tag's **/
function _remove_and_clen($, meta) {
    const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));
    meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
    meta.body.find('div,figure,figcaption,blockquote').map((i,elem) => clean_attr(elem));
    meta.body.contents().filter((index, node) => node.type === 'comment').remove();
    meta.body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();
}

/** Ingest News Article (article content)**/
function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.url).then($ => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($, item);
        console.log('processing',meta.title);

        // first paragraph (set_lede)
        const first_p = $('.article-sub-title').first()[0]
            || $('.media-sub-title').first()[0]
            || meta.body.find('p').first()[0];
        const lede = $(first_p).clone();
        lede.find('img').remove();
        meta.body.find(first_p).remove();
        meta['lede'] = lede;

        // download background image (sometimes)
        const article_bg = $('.article-background-image').first();
        if (article_bg.length != 0) {
            const bg = article_bg[0].attribs.style; //get url
            const src = bg.substring(bg.indexOf('http'), bg.indexOf('jpg') + 3);
            const info = $('.thumbnail-info').first().html();
            const figure = cheerio('<figure></figure>');
            const img = cheerio(`<img src="${src}" />`);
            const figcaption = cheerio(`<figcaption>${info}</figcaption>`);
            figure.append(img).append(figcaption);
            meta.body.prepend(figure);
        }
        const thumbnail = _download_image($, meta, hatch, asset);

        // download videos
        meta.body.find('iframe').map(function() {
            const src = this.attribs.src || '';
            if (src.includes('youtube')) {
                const video = libingester.util.get_embedded_video_asset($(this), src);
                video.set_title(meta.title);
                video.set_thumbnail(thumbnail);
                hatch.save_asset(video);
            }
        });

        // download instagram images
        const instagram_promises = meta.body.find('blockquote.instagram-media').map(function() {
            const href = $(this).find('a').first()[0].attribs.href;
            if (href) {
                return libingester.util.fetch_html(href).then(($inst) => { // It is necessary to wait
                    const image_uri = $inst('meta[property="og:image"]').attr('content');
                    const image_description = $inst('meta[property="og:description"]').attr('content');
                    const image_title = $inst('meta[property="og:title"]').attr('content') || meta.title;
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
            _remove_and_clen($, meta);
            _set_ingest_settings(asset, meta);
            asset.render();
            hatch.save_asset(asset);
        });
    }).catch(err => {
        if(err.code == 'ECONNRESET') return ingest_article(hatch, item);
    });
}

/** Ingest News Article (gallery content)**/
function ingest_gallery(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($);
        meta['lede'] = $('.media-sub-title').first();
        console.log('processing', meta.title);

        // remove elements and clean tag's
        _remove_and_clen($, meta);
        meta.body.find('figure a').map((i, elem) => {
            if (elem.attribs.href) {
                $(elem).replaceWith($(elem).children());
            }
        });

        // download post images
        _download_image($, meta, hatch, asset);

        _set_ingest_settings(asset, meta);
        asset.render();
        hatch.save_asset(asset);
    }).catch(err => {
        if(err.code == 'ECONNRESET') return ingest_gallery(hatch, uri);
    });
}

/** Ingest Video Article (only video content)**/
function ingest_video(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        let meta = _get_ingest_settings($);
        console.log('processing', meta.title);

        const video_uri = $('.video-player iframe').first().attr('src');
        if (video_uri) {
            // download background video (thumbnail)
            let bg_img_video;
            const bg_img_video_uri = $('meta[property="og:image"]').attr('content');
            bg_img_video = libingester.util.download_image(bg_img_video_uri);
            bg_img_video.set_title(meta.title);
            hatch.save_asset(bg_img_video);

            // save video asset
            const video = new libingester.VideoAsset();
            video.set_canonical_uri(uri);
            video.set_download_uri(video_uri);
            video.set_last_modified_date(meta.modified_date);
            video.set_license(meta.copyright);
            video.set_thumbnail(bg_img_video);
            video.set_title(meta.title);
            video.set_synopsis(meta.description);
            hatch.save_asset(video);
        }
    }).catch(err => {
        if(err.code == 'ECONNRESET') return ingest_video(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch();

    /** More recent articles posted **/
    const article = new Promise((resolve, reject) => {
        rss2json.load(FEED_RSS, (err, rss) => {
            if(err) reject();
            Promise.all(rss.items.map(item => ingest_article(hatch, item)))
                .then(() => resolve())
                .catch(err => reject(err))
        })
    });

    /** More recent galleries posted **/
    // const gallery = libingester.util.fetch_html(PAGE_GALLERY).then($ =>
    //     Promise.all( $('#main .swifts .content a.title').get()
    //         .map(a => url.resolve(BASE_URI, a.attribs.href)) // more recent media links
    //         .map(uri => ingest_gallery(hatch, uri))
    //     )
    // );

    /** More recent videos posted **/
    // const video = libingester.util.fetch_html(PAGE_VIDEO).then($ =>
    //     Promise.all($('#main .swifts .content a.title').get()
    //         .map(a => url.resolve(BASE_URI, a.attribs.href)) // more recent media links
    //         .map(uri => ingest_video(hatch, uri))
    //     )
    // );

    Promise.all([article])
        .then(() => hatch.finish());
}

main();
