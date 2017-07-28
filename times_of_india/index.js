'use strict';

const libingester = require('libingester');
const url = require('url');

const BASE_URI = 'http://timesofindia.indiatimes.com/';
const RSS_FEED = [
    'http://timesofindia.indiatimes.com/rssfeedstopstories.cms', // Top Stories
    'http://timesofindia.indiatimes.com/rssfeeds/1221656.cms', // Most recent stories
    'http://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms', // India
    'http://timesofindia.indiatimes.com/rssfeeds/296589292.cms', // World
    'http://timesofindia.indiatimes.com/rssfeeds/7098551.cms', // NRI
    'http://timesofindia.indiatimes.com/rssfeeds/1898055.cms', // Business
    'http://timesofindia.indiatimes.com/rssfeeds/4719161.cms', // Cricket
    'http://timesofindia.indiatimes.com/rssfeeds/4719148.cms', //Sports
    'http://timesofindia.indiatimes.com/rssfeeds/3908999.cms', // Healt
    'http://timesofindia.indiatimes.com/rssfeeds/-2128672765.cms', // Science
    'http://timesofindia.indiatimes.com/rssfeeds/2647163.cms', // Enviroment
    'http://timesofindia.indiatimes.com/rssfeeds/5880659.cms', // Tech
    'http://timesofindia.indiatimes.com/rssfeeds/913168846.cms', // Education
    'http://timesofindia.indiatimes.com/rssfeeds/784865811.cms', // Opinion
    'http://timesofindia.indiatimes.com/rssfeeds/1081479906.cms', // Entertaiment
    'http://timesofindia.indiatimes.com/rssfeeds/2886704.cms', // Life & Style
    'http://timesofindia.indiatimes.com/rssfeedmostread.cms', //Most read
    'http://timesofindia.indiatimes.com/rssfeedmostemailed.cms', // Most shared
    'http://timesofindia.indiatimes.com/rssfeedmostcommented.cms' // Most commented
];

// delete attr (tag)
const REMOVE_ATTR = [
    'class',
    'data-field',
    'data-original',
    'h',
    'height',
    'id',
    'itemscope',
    'itemprop',
    'itemtype',
    'photoid',
    'rel',
    'sizes',
    'style',
    'title',
    'type',
    'w',
    'width',
];

// remove elements (body)
const REMOVE_ELEMENTS = [
    'iframe',
    'noscript',
    'script',
    'style',
    '.cmnttxt',
    '.similar-articles',
    '.last8brdiv',
    '.mCustomScrollBox',
    'div',
    //'a[data-type="tilCustomLink"]',
    '.cptn_bg',
    '.photo_desc',
    '.comments_container'
];

const CUSTOM_CSS = `
$primary-light-color: #658C96;
$primary-medium-color: #222222;
$primary-dark-color: #BE2819;
$accent-light-color: #EA2927;
$accent-dark-color: #902310;
$background-light-color: #FDFDFD;
$background-dark-color: #EEEEEE;
$title-font: 'Roboto';
$body-font: 'Spectral';
$display-font: 'Roboto';
$context-font: 'Roboto';
$support-font: 'Roboto';

@import '_default';
`;

// delete duplicated elements in array
Array.prototype.unique=function(a){
    return function(){return this.filter(a)}}(function(a,b,c){return c.indexOf(a,b+1)<0
});

function clean_title(title) {
    return title.replace('| The Times of India','').replace('| Gadgets','').replace('- Times of India','').trim();
}

function ingest_gallery(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();

        let author = 'Times of India';
        let info_date = $('div.photo_title span').first().text() || '';
        const body = $('<div></div>');
        const my_body = $('.main-content, .slides');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const page = 'Times of india';
        const read_more = `Original article at <a href="${canonical_uri}">${page}</a>`;
        const synopsis = $('meta[name="description"]').attr('content');
        const section = $('meta[content="2"]').parent().text() || 'Article';
        const title = $('.title_section h1').text() || clean_title($('meta[property="og:title"]').attr('content'));
        const uri_main_image = $('meta[property="og:image"], meta[name="og:image"]').attr('content');
        let thumbnail;

        // set first paragraph
        asset.set_lede(synopsis);
        my_body.find('.imgblock img, .imagebox img').map((i, elem) => {
            let src;
            const data_src=elem.attribs['data-src'];
            if (data_src) {
                src=url.resolve(BASE_URI,elem.attribs['data-src']);
            } else {
                src=url.resolve(BASE_URI,elem.attribs.src);
            }
            const alt = elem.attribs.alt;
            const image = `<img src="${src}" alt="${alt}">`;
            const figure = $(`<figure>${image}</figure>`);
            const figcaption = $(`<figcaption><p>${alt}</p></figcaption>`);
            const down_img = libingester.util.download_img($(figure.children()[0]));
            down_img.set_title(title);
            if (!thumbnail) asset.set_thumbnail(thumbnail=down_img);
            hatch.save_asset(down_img);
            body.append(figure.append(figcaption));
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
        if (err.code == -1 || err.statusCode == 403) {
            console.log('Ingest gallery error:' + err);
        }
    });
}

function ingest_editorials(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const author = $('a.author').text();
        const body = $('.content');
        if (!body[0]) { // Error 404
            return;
        }
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const info_date = $('meta[property="article:published_time"]').attr('content');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const page = 'Times of india';
        const read_more = `Original article at <a href="${canonical_uri}">${page}</a>`;
        const synopsis = $('meta[name="description"]').attr('content');
        const section = $('meta[content="2"]').parent().text() || 'Article';
        const title = $('.title_section h1').text() || clean_title($('meta[property="og:title"]').attr('content'));
        const uri_main_image = $('meta[property="og:image"], meta[name="og:image"]').attr('content');

        // Remove images with name  "TOI Edit"
        if (!uri_main_image.includes('/toiedit-logo')) {
            // Pull out the main image
            let main_image, image_credit;
            if (uri_main_image) {
                main_image = libingester.util.download_image(uri_main_image, uri);
                main_image.set_title(title);
                image_credit = '';
                hatch.save_asset(main_image);
                asset.set_thumbnail(main_image);
                asset.set_main_image(main_image, image_credit);
            }
            asset.set_main_image(main_image, image_credit);
        }

        // set first paragraph
        const first_p = body.find('p').first();
        const lede = first_p.clone();
        asset.set_lede(lede);
        body.find(first_p).remove();

        // Article Settings
        console.log('processing: ', title);
        asset.set_authors([author]);
        asset.set_canonical_uri(canonical_uri);
        asset.set_custom_scss(CUSTOM_CSS);
        asset.set_date_published(Date.now(modified_date));
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
        if (err.code == -1 || err.statusCode == 403) {
            console.log('Ingest error:' + err);
        }
    });
}

function ingest_article(hatch, uri) {
    return libingester.util.fetch_html(uri).then(($) => {
        const asset = new libingester.NewsArticle();
        const author = $('span[itemprop=author]').text();
        let body = $('div.Normal, div.article p').first().attr('id','mybody');
        if (!body[0]) { // Error 404
            return;
        }
        const canonical_uri = $('link[rel="canonical"]').attr('href');
        const info_date = $('meta[itemprop="dateModified"], meta[name="Last-Modified-Date"]').attr('content');
        const modified_date = info_date ? new Date(Date.parse(info_date)) : new Date();
        const page = 'Times of India';
        const read_more = `Original article at <a href="${canonical_uri}">${page}</a>`;
        const synopsis = $('meta[name="description"]').attr('content');
        const section = $('meta[content="2"]').parent().text() || 'Article';
        const title = $('.title_section h1').text() || clean_title($('meta[property="og:title"]').attr('content'));
        const uri_main_image = $('meta[property="og:image"], meta[name="og:image"]').attr('content');

        // Remove images with name "TOI"
        if (!uri_main_image.includes('/47529300')) {
            // Pull out the main image
            let main_image, image_credit;
            if (uri_main_image) {
                main_image = libingester.util.download_image(uri_main_image, uri);
                main_image.set_title(title);
                image_credit = $('img_cptn').first().text() || $('div.title').text() ||'';
                hatch.save_asset(main_image);
                asset.set_thumbnail(main_image);
            }
            asset.set_main_image(main_image, image_credit);
        }

        let content = $('<div></div>');
        let last_p; // reference to the paragraph we are constructing
        body.contents().map((i,elem) => {
            // We start by validating if the 'elem' is text, or any other label that is not 'br'
            if ((elem.type == 'text' && elem.data.trim() != '') || elem.name != 'br') {
                if (!last_p) { // constructing a new paragraph
                    content.append($('<p></p>'));
                    last_p = content.find('p').last();
                }
                // if element is a 'div', check if the children are pictures
                // and if true, we create the corresponding tags (figure, figcaption)
                const attribs = elem.attribs || {};
                if (elem.name == 'div' && attribs.class=='image') {
                    elem.name='figure';
                    const figcaption = $(elem).next();
                    if (figcaption[0].name=='strong') {
                        $(elem).append(`<figcaption><p>${figcaption.text()}</p></figcaption>`);
                        figcaption.attr('class', 'remove');
                    }
                    const img = $(elem).find('img').first();
                    img[0].attribs.src=url.resolve(BASE_URI, img[0].attribs.src);
                    const image = libingester.util.download_img(img);
                    image.set_title(title);
                    hatch.save_asset(image);
                    content.append($(elem).clone());
                    return;
                }
                last_p.append($(elem).clone());
            } else if (elem.name == 'br') {
                // when we find a 'br', it's time to start with another paragraph
                last_p = undefined;
                $(elem).remove();
            }
        });
        body = content;
        body.find('.remove').remove();

        // set first paragraph
        const first_p = body.find('p').first();
        const lede = first_p.clone();
        lede.find('img').remove();
        asset.set_lede(lede);
        body.find(first_p).remove();

        // Delete other links
        body.find('strong a').map((i,elem) =>{
            $(elem).parent().remove();
        });

        // convert 'p strong' to 'h2'
        body.find('p strong').map((i,elem) => {
            const text = $(elem).text().trim();
            let parent = $(elem).parent()[0];
            while (parent) {
                if (parent.name == 'p') {
                    const p_text = $(parent).text().trim();
                    if (text == p_text) {
                        $(parent).replaceWith($(`<h2>${text}</h2>`));
                    }
                    break;
                } else {
                    parent = $(parent).parent()[0];
                }
            }
        });

        // remove elements and clean tags
        const clean_attr = (tag, a = REMOVE_ATTR) => a.forEach((attr) => $(tag).removeAttr(attr));
        body.find(REMOVE_ELEMENTS.join(',')).remove();
        body.find('p').filter((i,elem) => $(elem).text().trim() === '').remove();

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
        if (err.code == -1 || err.statusCode == 403) {
            console.log('Ingest error:' + err);
        }
    });
}

function ingest_by_category(hatch, link) {
    if (link.includes('/slideshows') || link.includes('/photostory')) {
        return ingest_gallery(hatch, link);
    } else if (link.includes('/toi-editorials') || link.includes('/Globespotting')) {
        return ingest_editorials(hatch, link);
    }
    else {
        return ingest_article(hatch, link);
    }
}

function fetch_all_rss_entries(list_of_rss, max_per_category) {
    let all_entries = [];
    const promises = list_of_rss.map(uri => {
        return libingester.util.fetch_rss_entries(uri, max_per_category).then(rss => {
            rss.map(item => all_entries.push(item.link));
        })
    })

    return Promise.all(promises).then(() => all_entries.unique());
}

function main() {
    const hatch = new libingester.Hatch('Times_of_india', 'en');
    const max_per_category = parseInt(process.argv[2]) || 5;

    fetch_all_rss_entries(RSS_FEED, max_per_category).then(links => {
        return Promise.all(links.map(link => ingest_by_category(hatch, link)))
            .then(() => hatch.finish())
    }).catch(err => {
        console.log(err);
        process.exitCode = 1;
    });
}

main();
