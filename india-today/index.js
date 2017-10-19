'use strict';

const libingester = require('libingester');
const url = require('url');

const FEEDS = [
    {link: 'http://indiatoday.intoday.in/rss/article.jsp?sid=34', category: 'economy'},
    {link: 'http://indiatoday.intoday.in/rss/video.jsp?vcid=0', category: 'video'},
    {link: 'http://indiatoday.intoday.in/rss/homepage-topstories.jsp', category: 'top stories'},
    {link: 'http://indiatoday.intoday.in/rss/gallery.jsp?pcid=0', category: 'photos'},
];

const CUSTOM_SCSS = `
$primary-light-color: #FFC600;
$primary-medium-color: #012A5A;
$primary-dark-color: #888888;
$accent-light-color: #FF0000;
$accent-dark-color: #D8211E;
$background-light-color: #FDFDFD;
$background-dark-color: #E1E1E1;
$title-font: 'Roboto';
$body-font: 'Roboto';
$display-font: 'Roboto';
$context-font: 'Roboto';
$support-font: 'Roboto';
@import '_default';
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
    'div',
    'iframe',
    'noscript',
    'script',
    'style',
];

/* delete duplicated elements in array (find by attr 'link' of object) */
Array.prototype.unique = function(a) {
    return function(){return this.filter(a)}}(function(a,b,c){
    for (let x=b+1; x<c.length; x++) {
        if (c[x].link == a.link) return false;
    }
    return true;
});

// get articles metadata
function get_ingest_settings($, item) {
    const canonical_uri = $('link[rel="canonical"]').attr('href');
    return {
        author: 'India Today',
        body: $('span[itemprop="articleBody"]').first().attr('id','mybody'),
        canonical_uri: canonical_uri,
        copyright: $('#copyrights').first().text(),
        date_published: item.date,
        modified_date: item.date,
        custom_scss: CUSTOM_SCSS,
        section: item.category,
        synopsis: $('meta[name="description"]').attr('content') || item.description,
        source: 'indiatoday.intoday.in',
        read_more: `Original Article at <a href="${canonical_uri}">www.indiatoday.intoday.in</a>`,
        title: item.title,
        uri_thumb: $('meta[property="og:image"]').attr('content'),
    }
}

// set articles metadata
function set_ingest_settings(hatch, asset, meta) {
    if (meta.author) asset.set_authors(meta.author);
    if (meta.body) asset.set_body(meta.body)
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
    asset.render();
    hatch.save_asset(asset);
    console.log('processing', meta.title);
}

/* if a network error is caught, try again */
const handle_network_error = (uri, callback, max_attempts = 3, attempt = 1) => {
    return libingester.util.fetch_html(uri).then($ => {
        return Promise.resolve(callback($));
    }).catch(err => {
        const is_network_error = err.code == 'ENOTFOUND' ||
                                 err.code == 'ETIMEDOUT' ||
                                 err.code == 'EAI_AGAIN' ||
                                 err.code == 'ECONNRESET';
        if (is_network_error && attempt <= max_attempts)
            return handle_network_error(uri, callback, max_attempts, ++attempt);
        if (!is_network_error) throw err;
    });
}

// finding first wrapp "elem": Object Cheerio; "id_main_tag": String
const find_first_wrapp = ($, elem, id_main_tag, wrap = false) => {
    let current = elem;
    let parent = $(current).parent()[0];
    while (parent) {
        const attr = parent.attribs || {};
        if (attr.id == id_main_tag) {
            if (wrap) return $(current);
            return current;
        } else {
            current = parent;
            parent = $(current).parent()[0];
        }
    }
}

/* return metadata of video (title, thumb, uri); thumb= thumbnail uri, uri= video download uri */
const embed_jwplayer = (src) => {
    return handle_network_error(src, ($) => {
        let text = $($('script')[6]).text();
        text = text.substring(text.indexOf('playlist: [')+11, text.indexOf('primary: "flash"'));
        text = text.replace(/\s+/g, ' ').trim();
        return {
            title: text.match(/.title:"([\S\s]*)", image/)[1],
            thumb: text.match(/.image: "([\S\s]*)", sources/)[1],
            uri: text.substring(text.lastIndexOf('file')).match(/file: "([\S\s]*)" }]./)[1]
        }
    });
}

/* for embed, generate tags (video and img) */
const get_tag_string = (uri_thumb, uri_video, title, description, domain) => {
    return {
        video:  `<video src="${uri_video}" thumb="${uri_thumb}" type="${domain}-video"
                title="${title}" description="${description}"></video>`,
        img:    `<img src="${uri_thumb}" alt="${title}" type="${domain}-image"
                description="${description}" />`
    }
}

/* wrap video with figure */
const wrap_video = ($, elem) => {
    const $figure = $(`<figure>${$(elem).html('')}</figure>`);
    const $tag = $figure.children();
    $(elem).replaceWith($figure);
    return $tag;
}

/* resolve the thumbnail (src) from youtube */
const get_url_thumb_youtube = (embed_src) => {
    const thumb = '/0.jpg';
    const base_uri_img = 'http://img.youtube.com/vi/';
    const uri = url.parse(embed_src);
    const is_youtube = ((uri.hostname === 'www.youtube.com') || (uri.hostname === 'www.youtube-nocookie.com'));
    if (is_youtube && uri.pathname.includes('/embed/')) {
        const path = uri.pathname.replace('/embed/','') + thumb;
        return url.resolve(base_uri_img, path);
    }
}

/* remove GET parameters */
const remove_params_uri = (uri) => {
    return url.resolve(uri, url.parse(uri).pathname);
}

/* return a Promise and set video_tag or image_tag instead of $replaced (no download) */
/* <video src="..." thumb="..."></video> or <img src="..."/> */
const ingest_media_twitter = ($main, $replaced, embed_src) => {
    return libingester.util.fetch_html(embed_src).then($tw => {
        const title = $tw('meta[property="og:title"]').first().attr('content') || '';
        const caption = $tw('meta[property="og:description"]').first().attr('content') || '';
        const uri_thumb = $tw('meta[property="og:image"]').attr('content');
        let uri_video = $tw('meta[property="og:video:url"]').attr('content');
        if (uri_video) uri_video = remove_params_uri(uri_video);
        const tags = get_tag_string(uri_thumb, uri_video, title, caption, 'twitter');

        if (uri_thumb) {
            const tag = (uri_video) ? tags.video : tags.img;
            $replaced.replaceWith($main(tag));
        }
    })
}

/* paging articles */
const paginate = ($main_body, $current, get_next, get_body) => {
    const next = get_next($current);
    if (!next) return Promise.resolve();
    return handle_network_error(next, ($) => {
        const $body = get_body($);
        $main_body.append($body.children());
        return paginate($main_body, $, get_next, get_body);
    });
}

/** Ingest Articles **/
function ingest_article(hatch, item) {
    return handle_network_error(item.link, ($) => {
        // if (!item.title.includes("Secret Superstar: Aamir Khan hosts special screening, ")) return;
        const asset = new libingester.NewsArticle();
        let meta = get_ingest_settings($, item), thumbnail;
        let media_promises = [];
        const is_gallery = item.category === 'photos';
        const is_video = item.category === 'video';
        const $body = $('<div id="mybody"></div>');

        // main image
        if (is_video) {
            const data = $('script[type="application/ld+json"]').first().text().replace(/[\s]+/g, ' ');
            const json = JSON.parse(data);
            const thumb = json.thumbnailUrl, uri = json.contentUrl, title = json.name;
            const tags = get_tag_string(thumb, uri, title, '', 'indiatoday');
            const $figure = $(`<figure>${tags.video}</figure>`);
            $body.append($figure);
            $body.append($('.videobox').first().children());
            meta.body = $body;
        } else if (is_gallery) {
            // for pagination
            const get_body = ($) => {
                const body = $('<div></div>');
                const $main = $('#show, .phpadding').first();
                const $cap = $main.find('.photocap').first();
                const $img = $main.find('img').first();
                const src = $img.attr('src');
                const $photo = $main.find('.photo').first();
                const $figure = $(`<figure><img src="${src}" /></figure>`);
                $cap.find('div').remove();
                if ($cap.text()) $figure.append(`<figcaption><p>${$cap.text()}</p></figcaption>`);
                if ($photo.text()) $figure.find('p').append(`<br /><span>${$photo.text()}</span>`);
                body.append($figure);
                return body;
            }

            // for pagination
            const get_next = ($) => $('a.next').attr('rel');

            meta.body = $body;
            meta.body.append(get_body($).children());

            media_promises.push(paginate(meta.body, $, get_next, get_body));
        } else {
            const $caption = $('.storyimgclose .stimagecaption').first();
            const main_image = libingester.util.download_image(meta.uri_thumb);
            const $fig = $(`<figcaption><p>${$caption.text()}</p></figcaption>`);
            const $figcaption = ($caption.text()) ? $fig : ''; // set cheerio object or string
            main_image.set_title(meta.title);
            asset.set_main_image(main_image, '');
            asset.set_thumbnail(main_image);
            hatch.save_asset(main_image);
        }

        // embed video
        meta.body.find('iframe').map((i,elem) => {
            const src = $(elem).attr('src');
            const domain = url.parse(src).hostname;
            switch (domain) {
                case 'indiatoday.intoday.in': {
                    media_promises.push(embed_jwplayer($(elem).attr('src')).then(data => {
                        const tags = get_tag_string(data.thumb, data.uri, data.title, '', 'indiatoday');
                        $(elem).replaceWith(tags.video);
                    }));
                    break;
                }
                case 'www.youtube.com': {
                    const thumb = get_url_thumb_youtube(src);
                    const tags = get_tag_string(thumb, src, meta.title, '', 'youtube');
                    $(elem).replaceWith(tags.video);
                    break;
                }
            }
        });

        // embed media
        meta.body.find('.twitter-tweet, .twitter-video').map((i,elem) => {
            for (const a of $(elem).find('a').get()) {
                const href = $(a).attr('href') || '';
                let domain = href ? url.parse(href).hostname : '';
                if (domain == 'twitter.com' && href.includes('/status/')) {
                    media_promises.push(ingest_media_twitter($, $(elem), href));
                    break;
                }
            }
        });

        const end_process = () => {
            // clean and remove
            meta.body.find('p>video').map((i,e) => $(e).insertBefore($(e).parent()));
            meta.body.find(REMOVE_ELEMENTS.join(',')).remove();
            meta.body.find('p,b').filter((i,e) => $(e).text().trim() === '').remove();

            // lede
            if (is_gallery) {
                meta.lede = $(`<p>${meta.synopsis}</p>`);
            } else {
                meta.lede = $('.strtitlealias p, .strtitlealias h2').first();
                meta.lede.find('img').remove();
            }

            // author
            let author = $('.authername').first().text() || '';
            author = author.replace('|','').replace(/[\s]+/g, ' ').trim();
            author = author.replace(/IndiaToday.in|Written\sby|,\sIndia\sToday/g,'');
            if (author) meta.author = author;

            // download image
            meta.body.find('img.pf_img').remove();
            meta.body.find('img').map((i,elem) => {
                const name = $(elem).attr('src').split('/').pop();
                let $img;

                if (name == 'star.gif' || name == 'halfstar.gif') return $(elem).remove();

                if (is_gallery) {
                    $img = $(elem);
                } else {
                    const $wrapp = find_first_wrapp($, elem, meta.body.attr('id'), true);
                    const caption = $wrapp.find('.mos-caption').first().text() || $(elem).attr('description');
                    const $figure = $(`<figure><img src="${$(elem).attr('src')}" alt="${$(elem).attr('src')}"/></figure>`);
                    const $figcaption = $(`<figcaption><p>${caption}</p></figcaption>`);
                    if (caption) $figure.append($figcaption);
                    $img = $figure.find('img');
                    $wrapp.replaceWith($figure);
                }
                const image = libingester.util.download_img($img);
                image.set_title(meta.title);
                hatch.save_asset(image);
                if (is_gallery && i == 0) asset.set_thumbnail(image);
            });

            // download video
            meta.body.find('video').map((i,elem) => {
                const title = $(elem).attr('title') || item.title;
                const $tag = wrap_video($, elem);
                const thumb = libingester.util.download_image($tag.attr('thumb'));
                const video = libingester.util.get_embedded_video_asset($tag, $tag.attr('src'));
                thumb.set_title(title);
                video.set_title(title);
                video.set_thumbnail(thumb);
                hatch.save_asset(thumb);
                hatch.save_asset(video);
                if (is_video) asset.set_thumbnail(thumb);
            });

            set_ingest_settings(hatch, asset, meta);
        }

        if (media_promises.length > 0) return Promise.all(media_promises).then(end_process);

        end_process();
    });
}

/* return all entries by category */
const fetch_all_entries = (oldDays = 1) => {
    let all_entries = [];
    return Promise.all(FEEDS.map(feed =>
        libingester.util.fetch_rss_entries(feed.link, Infinity, oldDays).then(entries => {
            for(const entry of entries) {
                entry.category = feed.category;
                entry.link = remove_params_uri(entry.link);
            }
            all_entries = all_entries.concat(entries);
        }))
    ).then(() => all_entries);
}

function main() {
    const hatch = new libingester.Hatch('indiatoday', 'en');
    const oldDays = parseInt(process.argv[2]) || 1;

    fetch_all_entries(oldDays).then(entries => {
        return Promise.all(entries.map(entry => ingest_article(hatch, entry)));
    })
    .then(() => hatch.finish())
    .catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
