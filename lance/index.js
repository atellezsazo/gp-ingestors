'use strict';

const libingester = require('libingester');
const moment = require('moment');
const url = require('url');

const BASE_URI = 'http://www.lance.com.br/';

const CUSTOM_SCSS = `
@import "_default";
`;

const REMOVE_ELEMENTS = [
    'div',
    'noscript',
    'script',
    'style',
    '.social-nav',
    '.media-main',
];

/* delete duplicated elements in array */
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

/** get articles metadata **/
function _get_ingest_settings($, uri) {
    // set Date
    let modDate = $('meta[property="article:published_time"]').attr('content');
    if (!modDate) {
        const date = $('.date').first().text().trim();
        const time = $('.time').first().text().trim();
        modDate = date + ' ' + time;
        modDate = moment(modDate, 'DD-MM-YYYYTHH:mm').toDate();
    } else {
        modDate = new Date(Date.parse(modDate));
    }

    // set author
    let author = $('meta[name="author"]').attr('content');
    if (!author) author = $('span[itemprop="author"]').first().text();

    // title
    let title = $('.post-title, .title').first().text() || $('meta[property="og:title"]').attr('content');
    title = title.trim();

    // section
    let section = $('meta[property="article:section"]').first().attr('content');
    if (!section) {
        section = url.parse(uri).path;
        section = section.substring(1, section.lastIndexOf('/'));
    }

    return {
        author: $('.post-author').first().text() || $('.signature ').first().text() || 'LANCE!',
        canonical_uri: uri,
        date_published: modDate,
        modified_date: modDate,
        // custom_scss: CUSTOM_SCSS,
        read_more: `Artigo original em <a href="${uri}">www.lance.com.br</a>`,
        section: section,
        synopsis: $('meta[property="og:description"]').attr('content'),
        source: 'lance',
        title: title,
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

/** ingest_article
 * @param {Object} hatch The Hatch object of the Ingester library
 * @param {String} uri The post uri
 */
function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then($ => {
        const asset = new libingester.NewsArticle();
        const body = $('.article-body, .content, .td-post-content').first().attr('id','mybody');
        const paragraph = $('p.paragraph');
        let meta = _get_ingest_settings($, uri);
        let thumbnail, main_image;

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

                if (to_do != 'replace') figure = body.find(`figure img[src="${src}"]`).parent();
                return figure;
            } else {
                $(replace).remove();
            }
        }

        // generate url thumbnail (Dailymotion Videos)
        const get_url_thumb_dailymotion = (embed_src) => embed_src.replace('embed', 'thumbnail');

        // resolve the thumbnail from youtube
        const get_url_thumb_youtube = (embed_src) => {
            const thumb = '/hqdefault.webp';
            const base_uri_img = 'https://i.ytimg.com/vi_webp/';
            const uri = url.parse(embed_src);
            if (uri.hostname === 'www.youtube.com' && uri.pathname.includes('/embed/')) {
                const path = uri.pathname.replace('/embed/','') + thumb;
                return url.resolve(base_uri_img, path);
            }
        }

        // add protocol to uri
        const fix_protocol_url = (uri, protocol) => {
            const q_uri = url.parse(uri);
            q_uri.protocol = protocol;
            return url.format(q_uri);
        }

        // fix content in a one paragraph
        if (paragraph.get().length >= 1) {
            paragraph.map((i,par) => {
                let p = $('<p></p>');
                $(par).contents().map((i,elem) => {
                    if ($(elem).text().trim() != '') {
                        p.append(elem);
                    } else if (elem.name == 'br') {
                        if (p.text().trim() != '') {
                            $(elem).replaceWith(p);
                            p = $('<p></p>');
                        } else {
                            $(elem).remove();
                        }
                    }
                });
                if (p.text().trim() != '') {
                    $(par).append(p);
                }

                if (body[0]) {
                    body.append($(par).children().clone());
                    $(par).remove();
                }
            })
        }

        // fixed iframes
        body.find('.media-main').map((i,elem) => {
            const iframe = $(elem).find('iframe');
            if (iframe[0]) iframe.insertBefore(elem);
        });
        body.find('p>iframe, div>iframe').map((i,elem) => $(elem).insertBefore($(elem).parent()));

        // embed videos
        body.find('iframe').map((i,elem) => {
            const src = fix_protocol_url($(elem).attr('src'), 'http:');
            const domain = url.parse(src).hostname;
            let video_thumb;

            const save_video = () => {
                const video = libingester.util.get_embedded_video_asset($(elem), src);
                video_thumb.set_title(meta.title);
                video.set_title(meta.title);
                video.set_thumbnail(video_thumb);
                video.set_synopsis(meta.synopsis);
                video.set_canonical_uri(uri);
                hatch.save_asset(video_thumb);
                hatch.save_asset(video);
                if (!thumbnail) asset.set_thumbnail(thumbnail = video_thumb);
            }

            switch (domain) {
                case 'www.dailymotion.com': {
                    const uri_thumb = get_url_thumb_dailymotion(src);
                    video_thumb = libingester.util.download_image(uri_thumb);
                    save_video();
                    break;
                }
                case 'www.youtube.com': {
                    const uri_thumb = get_url_thumb_youtube(src);
                    video_thumb = libingester.util.download_image(uri_thumb);
                    save_video();
                    break;
                }
            }
        });

        // fix p>img
        body.find('p>img').map((i,elem) => {
            const parent = $(elem).parent();
            const src = $(elem).attr('src');
            const alt = $(elem).attr('alt');
            fix_img_with_figure(parent, src, alt, 'before');
        });

        // fix slider pane
        body.find('.slider-pane .captioned-image, .media-main .captioned-image').map((i,elem) => {
            const img = $(elem).find('img').first();
            const foto_title = $(elem).find('.foto-title').text() || '';
            const caption = $(elem).find('foto-caption').text();
            const wrapp = find_first_wrapp(elem, body.attr('id'));
            const src = url.resolve(BASE_URI, img.attr('src'));
            const alt = img.attr('alt');
            if (foto_title.trim() != '') {
                $(`<h3>${foto_title}</h3>`).insertBefore(wrapp);
            }
            fix_img_with_figure(wrapp, src, alt, 'before', caption);
        });

        // fix gallery icon
        body.find('.gallery').map((i,gallery) => {
            $(gallery).find('.gallery-item img').map((i,elem) => {
                const src = $(elem).attr('src');
                const alt = $(elem).attr('alt');
                fix_img_with_figure(gallery, src, alt, 'before');
            });
            $(gallery).remove();
        });

        // remove elements
        body.find(REMOVE_ELEMENTS.join(',')).remove();

        // download images
        let first = true;
        body.find('img').map((i,elem) => {
            const image = libingester.util.download_img($(elem));
            image.set_title(meta.title);
            hatch.save_asset(image);
            if (!thumbnail) asset.set_thumbnail(thumbnail = image);
        });

        // remove empty elements
        body.find('p').filter((i,elem) => $(elem).text().trim() == '').remove();
        body.find('br').remove();

        // set thumbnail
        if (!thumbnail) {
            if (!meta.uri_thumb) meta.uri_thumb = $('#author-avatar img').attr('src');
            if (meta.uri_thumb) {
                thumbnail = libingester.util.download_image(meta.uri_thumb);
                thumbnail.set_title(meta.title);
                asset.set_thumbnail(thumbnail);
                hatch.save_asset(thumbnail);
            }
        }

        // set lede
        const first_p = body.find('p').first();
        if (first_p[0]) {
            meta['lede'] = first_p.clone();
            first_p.remove();
        } else {
            meta['lede'] = $(`<p>${meta.synopsis}</p>`);
        }

        meta['body'] = body;
        _set_ingest_settings(hatch, asset, meta);
    }).catch(err => {
        if (err.code == 'ECONNRESET' || err.code == 'ETIMEDOUT') return ingest_article(hatch, uri);
    });
}

function main() {
    const hatch = new libingester.Hatch('lance', 'pt');
    const days_old = parseInt(process.argv[2]) || 5;

    libingester.util.fetch_html(BASE_URI).then($ => {
        const links = $('.modules-secondary a.title, .module-gallery a.image')
            .filter((i,elem) => $(elem).attr('href'))
            .filter((i,elem) => !elem.attribs.href.includes('/temporeal'))
            .map((i,elem) => url.resolve(BASE_URI, elem.attribs.href)).get();

        return Promise.all(links.unique().map(uri => ingest_article(hatch, uri)));
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
