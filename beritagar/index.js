'use strict';

const libingester = require('libingester');
const mustache = require('mustache');
const Promise = require('bluebird');
const request = require('request');
const rp = require('request-promise');
const rss2json = require('rss-to-json');
const template = require('./template');
const url = require('url');

const base_uri = 'https://beritagar.id/';
const page_gallery = 'https://beritagar.id/spesial/foto/';
const page_video = 'https://beritagar.id/spesial/video/';
const rss_uri = 'https://beritagar.id/rss/';

// clean images
const remove_attr_img = [
    'class',
    'data-src',
    'src',
    'style'
];

// Remove elements (body)
const remove_elements = [
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

const remove_elements_header = [
    '.sponsored-socmed',
    'iframe',
    'script'
];

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

// post data
const get_post_data = (hatch, asset, $, uri) => {
    asset.set_canonical_uri(uri);
    const section = $('meta[property="article:section"]').attr('content');
    asset.set_section(section);
    const title = $('meta[property="og:title"]').attr('content');
    asset.set_title(title);
    const synopsis = $('meta[property="og:description"]').attr('content');
    asset.set_synopsis(synopsis);

    const modified_time = $('meta[property="article:modified_time"]').attr('content');
    let date = new Date(Date.parse(modified_time));
    if (!date) {
        date = new Date();
    }
    asset.set_last_modified_date(date);

    const $article_info = $('.article-info');
    $article_info.find('a').removeAttr('style');

    const author = $article_info.find('address').first(); // author post
    const published = $article_info.find('time').first(); // published data
    for (const element of remove_elements_header) {
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

    // article thumbnail
    const thumb_url = $('meta[property="og:image"]').attr('content');
    const thumb = libingester.util.download_image(thumb_url);
    thumb.set_title(post_data.title);
    hatch.save_asset(thumb);
    asset.set_thumbnail(thumb);

    // remove body tags and comments
    for (const element of remove_elements) {
        body.find(element).remove();
    }
    body.contents().filter((index, node) => node.type === 'comment').remove();

    // download images
    body.find('img').map(function() {
        download_image(hatch, this, post_data.title);
    });

    return body;
}

// render
const render_template = (hatch, asset, template, post_data) => {
    const content = mustache.render(template, post_data);
    asset.set_document(content);
    hatch.save_asset(asset);
}

function ingest_article(hatch, uri) {
    return new Promise((resolve, reject) => {
        if (uri.includes('/media/')) { // avoid repeated links
            resolve();
            return;
        }
        libingester.util.fetch_html(uri).then(($) => {
            const asset = new libingester.NewsArticle();
            let post_data = get_post_data(hatch, asset, $, uri);

            const article_subtitle = $('.article-sub-title').first();
            const body = get_body(hatch, asset, $, post_data);

            // download background image
            let bg_img;
            const article_bg = $('.article-background-image').first();
            if (article_bg.length != 0) {
                const bg = article_bg[0].attribs.style; //get url
                const bg_img_uri = bg.substring(bg.indexOf('http'), bg.indexOf('jpg') + 3);
                bg_img = libingester.util.download_image(bg_img_uri);
                bg_img.set_title(post_data.title);
                hatch.save_asset(bg_img);
            }

            // download instagram images
            const instagram_promises = body.find('blockquote.instagram-media').map(function() {
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

            Promise.all(instagram_promises).then(() => {
                post_data['article_subtitle'] = article_subtitle;
                post_data['bg_img'] = bg_img;
                post_data['body'] = body.html();
                render_template(hatch, asset, template.structure_template, post_data);
                resolve();
            });
        })
    });
}

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
    const article = new Promise((resolve, reject) => {
        rss2json.load(rss_uri, (err, rss) => {
            Promise.all(rss.items.map((item) => ingest_article(hatch, item.url))).then(() => resolve());
        });
    });

    const gallery = libingester.util.fetch_html(page_gallery).then(($) => {
        const tags = $('#main .swifts .content a.title').get();
        return Promise.all(tags.map((tag) => ingest_gallery(hatch, url.resolve(base_uri, tag.attribs.href))));
    });

    const video = libingester.util.fetch_html(page_video).then(($) => {
        const tags = $('#main .swifts .content a.title').get();
        return Promise.all(tags.map((tag) => ingest_video(hatch, url.resolve(base_uri, tag.attribs.href))));
    });

    Promise.all([article, gallery, video]).then(() => {
        return hatch.finish();
    });
}

main();