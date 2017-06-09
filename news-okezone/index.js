'use strict';

const cheerio = require('cheerio');
const libingester = require('libingester');
const rss2json = require('rss-to-json');

const FEED_RSS = "http://sindikasi.okezone.com/index.php/rss/1/RSS2.0"; //News RSS
const PAGE_GALLERY = 'http://news.okezone.com/foto'; // Galleries home section

const CUSTOM_SCSS = `
    $primary-light-color: #E3A840;
    $primary-medium-color: #575C62;
    $primary-dark-color: #3D3B41;
    $accent-light-color: #FFA300;
    $accent-dark-color: #E59200;
    $background-light-color: #F6F6F6;
    $background-dark-color: #F0F0F0;
    $title-font: ‘Roboto’;
    $body-font: ‘Roboto’;
    $display-font: ‘Roboto’;
    $context-font: ‘Roboto Slab’;
    $support-font: ‘Roboto’;
    @import "_default";
    .CardDefaultFamily{
    	box-shadow: none;
    }
    .CardDefaultFamily__context, .CardList__context {
    	font-weight: normal;
    }
`;

//remove attributes from images
const REMOVE_ATTR = [
    'border',
    'class',
    'id',
    'style',
];

//Remove elements
const REMOVE_ELEMENTS = [
    'iframe',
    'noscript', //any script injection
    'script', //any script injection
    'style',
    '#AdAsia', //Asia ads
    '#sas_44269',
    '.wrap-rekomen', //recomendation links
];

// get articles metadata
function _get_ingest_settings($) {
    return {
        author: $('.author .nmreporter div, .news-fr').text(),
        canonical_uri: $('link[rel="canonical"]').attr('href'),
        copyright: $('meta[name="copyright"]').attr('content'),
        custom_scss: CUSTOM_SCSS,
        section:  $('.bractive').first().text() || 'Gallery',
        synopsis: $('meta[name="description"]').attr('content'),
        source: 'news.okezone',
        read_more: `Baca lebih lanjut tentang <a href="${$('link[rel="canonical"]').attr('href')}">news.okezone</a>`,
        title: $('h1').first().text(),
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

/** Ingest Articles **/
function ingest_article(hatch, item) {
    return libingester.util.fetch_html(item.url).then($ => {
        let meta = _get_ingest_settings($);
        if (!meta.title) throw { code: -1 }; // malformed page

        // article settings
        console.log('processing', meta.title);
        meta['body'] = $('#contentx, .bg-euro-body-news-hnews-content-textisi').first();
        meta['modified_date'] = new Date(item.created);
        meta['date_published'] = item.created;
        const asset = new libingester.NewsArticle();
        const first_p = meta.body.find('p').first();
        const uri_main_image = $('#imgCheck').attr('src');
        _set_ingest_settings(asset, meta);

        // pull out the main image
        const main_image = libingester.util.download_image(uri_main_image);
        const image_description = $('.caption-img-ab').children();
        main_image.set_title(meta.title);
        hatch.save_asset(main_image);
        asset.set_thumbnail(main_image);
        asset.set_main_image(main_image, image_description);

        // set first paragraph of the body
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);
        const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));

        //Download images
        meta.body.find('img').map(function() {
            if (this.attribs.src) {
                clean_attr(this);
                const image = libingester.util.download_img($(this));
                this.attribs['data-libingester-asset-id'] = image.asset_id
                image.set_title(meta.title)
                hatch.save_asset(image);
            } else {
                $(this).remove();
            }
        });

        // download videos
        meta.body.find('#molvideoplayer, p iframe').get().map(iframe => {
            const video = libingester.util.get_embedded_video_asset($(iframe), iframe.attribs.src);
            video.set_title(meta.title);
            video.set_thumbnail(main_image);
            hatch.save_asset(video);
        });

        //remove and clean elements
        meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
        meta.body.find(first_p).remove();
        meta.body.contents().filter((index, node) => node.type === 'comment').remove();
        meta.body.find('span').map((i,elem) => clean_attr(elem));

        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        if (err.code == -1 || err.statusCode == 403) {
            return ingest_article(hatch, item);
        }
    });
}

/** Ingest Galleries **/
function ingest_gallery(hatch, item) {
    return libingester.util.fetch_html(item.url).then($ => {
        let meta = _get_ingest_settings($);
        if (!meta.title) throw { code: -1 }; // malformed page

        // arcitle settings
        console.log('processing', meta.title);
        const asset = new libingester.NewsArticle();
        meta['body'] = cheerio('<div></div>');
        meta['lede'] = cheerio(`<p>${meta.synopsis}</p>`);
        meta['modified_date'] = new Date(item.pubDate);
        meta['date_published'] = Date.now(meta.modified_date);
        _set_ingest_settings(asset, meta);

        // Create body and download images
        let thumbnail;
        $('.thumbnails img').get().map(img => meta.body.append($(img).clone()));
        meta.body.find('img').map(function() {
            if (this.attribs.src) {
                delete this.attribs.style;
                this.attribs.src = this.attribs.src.replace('small.','large.');
                const image = libingester.util.download_img($(this));
                this.attribs['data-libingester-asset-id'] = image.asset_id;
                image.set_title(meta.title);
                hatch.save_asset(image);
                if(!thumbnail) asset.set_thumbnail(thumbnail = image);
            } else {
                $(this).remove();
            }
        });

        asset.set_body(meta.body);
        asset.render();
        hatch.save_asset(asset);
    }).catch((err) => {
        if (err.code == -1 || err.statusCode == 403) {
            return ingest_gallery(hatch, item);
        }
    });
}

function main() {
    const hatch = new libingester.Hatch();
    const get_item = ($, item) => {
        return {
            url: $(item).find('h3 a').attr('href'),
            pubDate: $(item).find('time').text().replace(/[\t\n\r]/g,''),
        }
    }

    // news articles
    const news = new Promise((resolve, reject) => {
        rss2json.load(FEED_RSS, function(err, rss) {
            Promise.all(rss.items.map(item => ingest_article(hatch, item)))
                .then(() => resolve());
        });
    });

    // gallery articles
    const gallery = libingester.util.fetch_html(PAGE_GALLERY).then($ => {
        const items = $('.content-hardnews').get().map(item => get_item($, item));
        return Promise.all(items.map(item => ingest_gallery(hatch, item)));
    });

    Promise.all([gallery, news])
        .then(() => hatch.finish());
}

main();
