'use strict';

const libingester = require('libingester');
const url = require('url');

const RSS_FEED = 'https://omelete.uol.com.br/feeds/todas/';
const RSS_FEEDS = [
    'https://omelete.uol.com.br/feeds/filmes/',
    'https://omelete.uol.com.br/feeds/series-tv/',
    'https://omelete.uol.com.br/feeds/quadrinhos/',
    'https://omelete.uol.com.br/feeds/musica/',
    'https://omelete.uol.com.br/feeds/videos/',
];

const CUSTOM_SCSS = `
$primary-light-color: #468EE5;
$primary-medium-color: #314058;
$primary-dark-color: #1A64DE;
$accent-light-color: #0B9675;
$accent-dark-color: #086E56;
$background-light-color: #F8F8F8;
$background-dark-color: #E3E6E3;

$title-font: 'Liberation Sans';
$body-font: 'Liberation Serif';
$display-font: 'Liberation Sans';
$context-font: 'Liberation Sans';
$support-font: 'Liberation Sans';

@import "_default";
`;

/** cleaning elements **/
const CLEAN_ELEMENTS = [
    'p',
    'table',
    'td',
    'tr',
];

/** delete attr (tag) **/
const REMOVE_ATTR = [
    'align',
    'class',
    'style',
];

const REMOVE_ELEMENTS = [
    'link',
    'noscript',
    'script',
    'style',
    '.omelete-ad',
    '.galeria-conteudo-outer',
    '.gallery',
    '.huge-extra-gutter-top',
    '.twitter-video',
    '.video-player',
];

const item = {
    link: 'https://omelete.uol.com.br/quadrinhos/lista/11-super-herois-que-tem-os-melhores-bigodes-dos-quadrinhos/',
    author: 'author',
    date: new Date(),
    description: 'description',
    title: 'TITLE',
}


/** get articles metadata **/
function _get_ingest_settings($, item) {
    const section = $('span[itemprop="articleSection"]').first().text().trim() ||
                    $('meta[property="og:article:section"]').attr('content');
    return {
        author: item.author,
        body: $('div[itemprop="articleBody"] .article-main').first().attr('id','mybody'),
        canonical_uri: item.link,
        custom_scss: CUSTOM_SCSS,
        date_published: item.date,
        lede: $('.subtitle').first(),
        modified_date: item.date,
        read_more: `Original Article at <a href="${item.link}">www.omelete.uol.com.br</a>`,
        section: section,
        synopsis: item.description,
        source: 'omelete',
        title: item.title,
        uri_thumb: $('meta[property="og:image"]').attr('content'),
    }
}

/** set articles metadata **/
function _set_ingest_settings(hatch, asset, meta) {
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
    console.log('processing', meta.title);
    asset.render();
    hatch.save_asset(asset);
}

/* delete duplicated elements in array */
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

/** ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The post uri
 */
function ingest_article(hatch, item, attemp = 1, max_attemps = 5) {
    return libingester.util.fetch_html(item.link).then($ => {
        // some links can not be accessed
        const h1 = $('h1').text().trim();
        if (h1 == '403 Forbidden') throw {message: h1, code: 403};

        // metadata
        const asset = new libingester.NewsArticle();
        let meta = _get_ingest_settings($, item);
        let thumbnail;

        // resolve the thumbnail from youtube
        const get_url_thumb_youtube = (embed_src) => {
            const thumb = '/0.jpg';
            const base_uri_img = 'http://img.youtube.com/vi/';
            const uri = url.parse(embed_src);
            if (uri.hostname === 'www.youtube.com' && uri.pathname.includes('/embed/')) {
                const path = uri.pathname.replace('/embed/','') + thumb;
                return url.resolve(base_uri_img, path);
            }
        }

        // finding first wrapp; "elem": Object Cheerio; "id_main_tag": String
        const find_first_wrapp = (elem, id_main_tag) => {
            let current = elem;
            let parent = $(current).parent()[0];
            while (parent) {
                const attr = parent.attribs || {};
                if (attr.id == id_main_tag) {
                    return current;
                } else {
                    current = parent;
                    parent = $(current).parent()[0];
                }
            }
        }

        // fix the image, add figure and figcaption (caption: String, search_caption: String, find_caption: function)
        const fix_img_with_figure = (replace, src, alt = '', to_do = 'replace', caption, search_caption, find_caption) => {
            if (src && replace) {
                let figure = $(`<figure><img src="${src}" alt="${alt}"></img></figure>`);
                let figcaption = $(`<figcaption></figcaption>`);
                // finding figcaption by search_caption or callback function (find_caption)
                if (typeof caption == 'string') {
                    figcaption.append(`<p>${caption}</p>`);
                } else if (find_caption) {
                    const cap = find_caption();
                    figcaption.append(`<p>${cap.html()}</p>`);
                } else if (search_caption) {
                    const cap = $(replace).find(search_caption).first();
                    figcaption.append(`<p>${cap.html()}</p>`);
                }
                // if found.. add to figure
                if (figcaption.text().trim() != '') {
                    figure.append(figcaption);
                }
                // replace or insert and return
                switch (to_do) {
                    case 'replace': { $(replace).replaceWith(figure); break; }
                    case 'after': { figure.insertAfter(replace); break; }
                    case 'before': { figure.insertBefore(replace); break; }
                }

                if (to_do != 'replace') figure = meta.body.find(`figure img[src="${src}"]`).parent();
                return figure;
            } else {
                $(replace).remove();
            }
        }

        // add protocol to uri
        const fix_protocol_url = (uri, protocol = 'http:') => {
            const q_uri = url.parse(uri);
            q_uri.protocol = protocol;
            return url.format(q_uri);
        }

        // fixed embed videos (youtube)
        meta.body.find('.videoWrapper').map((i,elem) => {
            const script = $(elem).next();
            const txt = script.text();
            const iframe = $(txt.substring(txt.indexOf('<iframe'), txt.indexOf('/iframe>')+8));
            if (iframe[0]) {
                const src = iframe.attr('src');
                const domain = url.parse(src).hostname;
                switch (domain) {
                    case 'www.youtube.com': {
                        const uri_thumb = get_url_thumb_youtube(src);
                        const video = libingester.util.get_embedded_video_asset(script, src);
                        const video_thumb = libingester.util.download_image(uri_thumb);
                        video_thumb.set_title(item.title);
                        video.set_title(item.title);
                        video.set_thumbnail(video_thumb);
                        hatch.save_asset(video_thumb);
                        hatch.save_asset(video);
                        break;
                    }
                }
            }
        });

        // fixed embed videos (twitter)
        const download_twiter_video = (body, title) => {
            let twitter_video_promises = [];
            body.find('.twitter-video').map((i,elem) => {
                for (const a of $(elem).find('a').get()) {
                    const href = $(a).attr('href') || '';
                    let domain = href ? url.parse(href).hostname : '';
                    if (domain == 'twitter.com' && href.includes('/status/')) {
                        twitter_video_promises.push(
                            libingester.util.fetch_html(href).then($tw => {
                                const uri_thumb = $tw('meta[property="og:image"]').attr('content');
                                const download_uri = $tw('meta[property="og:video:url"]').attr('content');
                                const video_thumb = libingester.util.download_image(uri_thumb);
                                const video = libingester.util.get_embedded_video_asset($(elem), download_uri);
                                video_thumb.set_title(title);
                                video.set_title(title);
                                video.set_thumbnail(video_thumb);
                                hatch.save_asset(video_thumb);
                                hatch.save_asset(video);
                            })
                        );
                        break;
                    }
                }
            });
            return twitter_video_promises;
        }

        let video_promises = download_twiter_video(meta.body, meta.title);

        // fixed galleries
        const max_images_gallery = 50; // some galleries have more than 600 images
        meta.body.find('.gallery').map((i,elem) => {
            const wrapp = find_first_wrapp(elem, meta.body.attr('id'));
            const gallery_item = $(elem).find('.gallery-item-big').get().slice(0, max_images_gallery);
            for (const item_big of gallery_item) {
                const img = $(item_big).find('img').first();
                const src = fix_protocol_url(img.attr('src') || img.attr('data-lazy'));
                const alt = img.attr('alt');
                const caption = $(item_big).find('.description').first().text().trim();
                fix_img_with_figure(wrapp, src, alt, 'before', caption);
            }
        });

        // end process
        const end_process = () => {
            // fixed all tags (soma-widget)
            meta.body.find('a[data-soma-widget="VideoLink"]').map((i,elem) => {
                const wrapp = find_first_wrapp(elem, meta.body.attr('id'));
                $(elem).insertBefore(wrapp);
            });

            // remove elements and clean
            const clean_attr = (tag) => REMOVE_ATTR.forEach(attr => $(tag).removeAttr(attr));
            meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
            meta.body.find(CLEAN_ELEMENTS.join(',')).map((i,elem) => clean_attr(elem));

            // function for download image
            meta.body.find('img').map((i,elem) => {
                let image;
                if ($(elem).parent()[0].name != 'figure') {
                    const wrapp = find_first_wrapp(elem, meta.body.attr('id'));
                    const src = fix_protocol_url($(elem).attr('src') || $(elem).attr('data-lazy'));
                    const alt = $(elem).attr('alt');
                    const figure = fix_img_with_figure(wrapp, src, alt);
                    image = libingester.util.download_img($(figure.children()[0]));
                } else {
                    image = libingester.util.download_img($(elem));
                }
                image.set_title(meta.title);
                hatch.save_asset(image);
                if (!thumbnail) asset.set_thumbnail(thumbnail = image);
            });

            // set default thumbnail
            if (!thumbnail && meta.uri_thumb) {
                const uri_thumb = fix_protocol_url(meta.uri_thumb);
                const image = libingester.util.download_image(uri_thumb);
                image.set_title(meta.title);
                asset.set_thumbnail(image);
                hatch.save_asset(image);
            }

            // delete divs
            meta.body.contents().filter((i,elem) => elem.name == 'div').remove();

            // end ingest
            _set_ingest_settings(hatch, asset, meta);
        }

        if (video_promises.length > 0) {
            return Promise.all(video_promises).then(() => end_process());
        } else {
            end_process();
        }
    })
    .catch(err => {
        // console.log(item.link, err);
        const condition = ((
            err.code == 'ECONNRESET' ||
            err.code == 'ETIMEDOUT' ||
            err.code == 403
        ) && (attemp < max_attemps));

        if (condition) return ingest_article(hatch, item, ++attemp);
    });
}

function main() {
    const hatch = new libingester.Hatch('omelete', 'pt');
    let all_items = [];

    // ingest_article(hatch, item).then(() => hatch.finish());

    Promise.all(RSS_FEEDS.map(link => libingester.util.fetch_rss_entries(link, 20, 5)
        .then(items => { all_items = all_items.concat(items) })))
        .then(() => Promise.all(all_items.map(item => ingest_article(hatch, item))))
        .then(() => hatch.finish())
        .catch(err => {
            console.log(item.link, err);
            process.exitCode = 1;
        });
}

main();
